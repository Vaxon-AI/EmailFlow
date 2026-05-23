import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Tests for the failed-email-sync lifecycle state machine:
//
//   recordFailedEmail  ─────────────────────────► pending
//   recordRetryFailure (count < MAX_RETRY_COUNT) ► retrying
//   recordRetryFailure (count = MAX_RETRY_COUNT) ► permanent_failed  ← terminal
//   resolveFailedEmail ──────────────────────────► resolved           ← terminal
//
// loadPendingFailures is the gatekeeper: it only returns ['pending', 'retrying'].
// Terminal states (permanent_failed, resolved) are permanently excluded.
// ---------------------------------------------------------------------------

vi.mock('@/lib/prisma', () => ({
  prisma: {
    failedEmailSync: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  recordRetryFailure,
  loadPendingFailures,
  resolveFailedEmail,
  recordFailedEmail,
  countPendingFailures,
  MAX_RETRY_COUNT,
} from '../failed-email-sync-repo'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockRepo = vi.mocked(prisma.failedEmailSync)

function withRetryCount(n: number) {
  mockRepo.findUnique.mockResolvedValue({ retryCount: n } as any)
  mockRepo.update.mockResolvedValue({} as any)
}

function captureUpdateData() {
  const calls: Record<string, unknown>[] = []
  ;(mockRepo.update as ReturnType<typeof vi.fn>).mockImplementation((args: any) => {
    calls.push(args.data)
    return Promise.resolve({} as never)
  })
  return calls
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRepo.update.mockResolvedValue({} as any)
  mockRepo.upsert.mockResolvedValue({} as any)
  mockRepo.findMany.mockResolvedValue([])
  mockRepo.count.mockResolvedValue(0)
})

// ---------------------------------------------------------------------------
// recordRetryFailure — retryCount arithmetic
// ---------------------------------------------------------------------------

describe('recordRetryFailure — retryCount increments', () => {
  it('increments retryCount from 0 to 1', async () => {
    withRetryCount(0)
    const updates = captureUpdateData()

    await recordRetryFailure('user-1', 'msg-1', 'first failure')

    expect(updates[0]).toMatchObject({ retryCount: 1 })
  })

  it('increments retryCount from 3 to 4', async () => {
    withRetryCount(3)
    const updates = captureUpdateData()

    await recordRetryFailure('user-1', 'msg-1', 'fourth failure')

    expect(updates[0]).toMatchObject({ retryCount: 4 })
  })

  it('always increments by exactly 1 regardless of current count', async () => {
    for (let current = 0; current < MAX_RETRY_COUNT - 1; current++) {
      vi.clearAllMocks()
      withRetryCount(current)
      const updates = captureUpdateData()

      await recordRetryFailure('user-1', 'msg-1', 'error')

      expect(updates[0].retryCount).toBe(current + 1)
    }
  })

  it('records the errorReason in the update', async () => {
    withRetryCount(1)
    const updates = captureUpdateData()

    await recordRetryFailure('user-1', 'msg-1', 'unique constraint violation')

    expect(updates[0]).toMatchObject({ errorReason: 'unique constraint violation' })
  })

  it('does nothing when the record does not exist', async () => {
    mockRepo.findUnique.mockResolvedValue(null)

    await recordRetryFailure('user-1', 'non-existent-msg', 'error')

    expect(mockRepo.update).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// recordRetryFailure — status transitions
// ---------------------------------------------------------------------------

describe('recordRetryFailure — status transitions', () => {
  it('sets status to "retrying" on the first failure (retryCount 0 → 1)', async () => {
    withRetryCount(0)
    const updates = captureUpdateData()

    await recordRetryFailure('user-1', 'msg-1', 'error')

    expect(updates[0]).toMatchObject({ status: 'retrying' })
  })

  it(`sets status to "retrying" while retryCount stays below MAX_RETRY_COUNT (${MAX_RETRY_COUNT})`, async () => {
    // All transitions from retryCount 0 through MAX_RETRY_COUNT-2 stay "retrying"
    for (let current = 0; current < MAX_RETRY_COUNT - 1; current++) {
      vi.clearAllMocks()
      withRetryCount(current)
      const updates = captureUpdateData()

      await recordRetryFailure('user-1', 'msg', 'err')

      expect(updates[0].status).toBe('retrying')
    }
  })

  it(`sets status to "permanent_failed" when newRetryCount reaches MAX_RETRY_COUNT (${MAX_RETRY_COUNT})`, async () => {
    // retryCount is currently MAX_RETRY_COUNT-1; after increment it equals MAX_RETRY_COUNT
    withRetryCount(MAX_RETRY_COUNT - 1)
    const updates = captureUpdateData()

    await recordRetryFailure('user-1', 'msg-1', 'final failure')

    expect(updates[0]).toMatchObject({
      retryCount: MAX_RETRY_COUNT,
      status: 'permanent_failed',
    })
  })

  it('boundary: MAX_RETRY_COUNT - 1 retries → still "retrying"', async () => {
    // One retry before the limit — must stay retrying
    withRetryCount(MAX_RETRY_COUNT - 2)
    const updates = captureUpdateData()

    await recordRetryFailure('user-1', 'msg-1', 'almost at limit')

    expect(updates[0].status).toBe('retrying')
  })

  it('boundary: MAX_RETRY_COUNT retries → "permanent_failed"', async () => {
    withRetryCount(MAX_RETRY_COUNT - 1)
    const updates = captureUpdateData()

    await recordRetryFailure('user-1', 'msg-1', 'at limit')

    expect(updates[0].status).toBe('permanent_failed')
  })
})

// ---------------------------------------------------------------------------
// Full state machine — simulated lifecycle
// ---------------------------------------------------------------------------

describe('full lifecycle: pending → retrying (×N) → permanent_failed', () => {
  it(`produces ${MAX_RETRY_COUNT - 1} "retrying" transitions then 1 "permanent_failed"`, async () => {
    const statuses: string[] = []

    ;(mockRepo.update as ReturnType<typeof vi.fn>).mockImplementation((args: any) => {
      statuses.push(args.data.status)
      return Promise.resolve({} as never)
    })

    for (let attempt = 0; attempt < MAX_RETRY_COUNT; attempt++) {
      mockRepo.findUnique.mockResolvedValue({ retryCount: attempt } as any)
      await recordRetryFailure('user-1', 'msg-1', `attempt ${attempt + 1}`)
    }

    expect(statuses).toHaveLength(MAX_RETRY_COUNT)
    expect(statuses.slice(0, MAX_RETRY_COUNT - 1)).toEqual(
      Array(MAX_RETRY_COUNT - 1).fill('retrying')
    )
    expect(statuses[MAX_RETRY_COUNT - 1]).toBe('permanent_failed')
  })

  it('MAX_RETRY_COUNT is exactly 5 (hard-coded sentinel)', () => {
    // If someone changes this constant without updating the test, this breaks loudly.
    expect(MAX_RETRY_COUNT).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// loadPendingFailures — the gatekeeper
// ---------------------------------------------------------------------------

describe('loadPendingFailures — status filter', () => {
  it('queries with status in ["pending", "retrying"] — the only actionable states', async () => {
    await loadPendingFailures('user-1')

    expect(mockRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['pending', 'retrying'] },
        }),
      })
    )
  })

  it('excludes "permanent_failed" from the query (terminal state must not re-enter the queue)', async () => {
    await loadPendingFailures('user-1')

    const { where } = (mockRepo.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(where.status.in).not.toContain('permanent_failed')
  })

  it('excludes "resolved" from the query', async () => {
    await loadPendingFailures('user-1')

    const { where } = (mockRepo.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(where.status.in).not.toContain('resolved')
  })

  it('filters by the correct userId', async () => {
    await loadPendingFailures('user-42')

    expect(mockRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-42' }),
      })
    )
  })

  it('orders results by firstFailedAt ascending (oldest failures retried first)', async () => {
    await loadPendingFailures('user-1')

    expect(mockRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { firstFailedAt: 'asc' },
      })
    )
  })
})

// ---------------------------------------------------------------------------
// resolveFailedEmail — terminal "resolved" state
// ---------------------------------------------------------------------------

describe('resolveFailedEmail', () => {
  it('sets status to "resolved"', async () => {
    const updates = captureUpdateData()

    await resolveFailedEmail('user-1', 'msg-ok')

    expect(updates[0]).toMatchObject({ status: 'resolved' })
  })

  it('sets resolvedAt to a recent timestamp', async () => {
    const before = Date.now()
    const updates = captureUpdateData()

    await resolveFailedEmail('user-1', 'msg-ok')

    const after = Date.now()
    const resolvedAt = updates[0].resolvedAt as Date
    expect(resolvedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(resolvedAt.getTime()).toBeLessThanOrEqual(after)
  })

  it('targets the correct userId + providerMessageId composite key', async () => {
    await resolveFailedEmail('user-99', 'specific-msg')

    expect(mockRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_providerMessageId: { userId: 'user-99', providerMessageId: 'specific-msg' } },
      })
    )
  })
})

// ---------------------------------------------------------------------------
// recordFailedEmail — initial "pending" state
// ---------------------------------------------------------------------------

describe('recordFailedEmail', () => {
  it('creates the record with status "pending" and retryCount 0', async () => {
    mockRepo.upsert.mockResolvedValue({} as any)

    await recordFailedEmail(
      'user-1',
      { providerMessageId: 'msg-new', threadId: 'thread-1', receivedAt: new Date(), subject: 'Test', sender: 'a@b.com' },
      'initial write failed'
    )

    expect(mockRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: 'pending',
          retryCount: 0,
        }),
      })
    )
  })

  it('resets status back to "pending" on an existing record (re-enqueues for retry)', async () => {
    await recordFailedEmail(
      'user-1',
      { providerMessageId: 'msg-existing', threadId: null, receivedAt: new Date(), subject: 'S', sender: 's@s.com' },
      'second failure'
    )

    expect(mockRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: 'pending' }),
      })
    )
  })

  it('stores providerMessageId', async () => {
    await recordFailedEmail(
      'user-1',
      { providerMessageId: 'gmail-abc-123', threadId: null, receivedAt: new Date(), subject: 'S', sender: 's@s.com' },
      'error'
    )

    expect(mockRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_providerMessageId: { userId: 'user-1', providerMessageId: 'gmail-abc-123' } },
        create: expect.objectContaining({
          providerMessageId: 'gmail-abc-123',
        }),
      })
    )
  })
})

// ---------------------------------------------------------------------------
// countPendingFailures
// ---------------------------------------------------------------------------

describe('countPendingFailures', () => {
  it('returns the count from prisma', async () => {
    mockRepo.count.mockResolvedValue(7)
    expect(await countPendingFailures('user-1')).toBe(7)
  })

  it('returns 0 when there are no pending failures', async () => {
    mockRepo.count.mockResolvedValue(0)
    expect(await countPendingFailures('user-1')).toBe(0)
  })

  it('counts only pending/retrying records — same filter as loadPendingFailures', async () => {
    await countPendingFailures('user-1')

    expect(mockRepo.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['pending', 'retrying'] },
        }),
      })
    )
  })
})
