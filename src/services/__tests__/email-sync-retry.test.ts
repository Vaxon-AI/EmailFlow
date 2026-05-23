import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Tests for the retryFailedEmails path inside syncEmailsPhase2.
//
// retryFailedEmails is a private function — we exercise it by calling
// syncEmailsPhase2 with an empty storedEmails array.  That skips the AI
// pipeline loop entirely, so every storeEmail / resolveFailedEmail /
// recordRetryFailure call we observe comes exclusively from the retry path.
//
// The core invariant being tested:
//   "Even when AI or the initial store fails, the system can recover the
//    email in a subsequent sync run without manual intervention."
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/repositories/email-repo', () => ({
  storeEmail: vi.fn(),
  fixStuckEmails: vi.fn(),
}))

vi.mock('@/repositories/failed-email-sync-repo', () => ({
  loadPendingFailures: vi.fn(),
  resolveFailedEmail: vi.fn(),
  recordRetryFailure: vi.fn(),
  // Unused in phase2 but imported by the module — prevent resolution errors
  recordFailedEmail: vi.fn(),
  countPendingFailures: vi.fn(),
}))

vi.mock('@/repositories/user-repo', () => ({
  getUserSyncInfo: vi.fn(),
  updateLastSync: vi.fn(),
  listEnabledEmailAccounts: vi.fn(),
  updateAccountLastSync: vi.fn(),
}))

vi.mock('@/integrations/provider-registry', () => ({
  getEmailProvider: vi.fn(),
}))

vi.mock('@/workflows', () => ({
  processEmail: vi.fn(),
}))

vi.mock('@/lib/quota', () => ({
  getClassifyRemaining: vi.fn().mockResolvedValue(Infinity),
  incrementClassifyUsed: vi.fn().mockResolvedValue(undefined),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import * as emailRepo from '@/repositories/email-repo'
import * as failedRepo from '@/repositories/failed-email-sync-repo'
import { syncEmailsPhase2 } from '../email-sync-service'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// RETRY_BATCH_SIZE is 10 (private const in the service).
const RETRY_BATCH_SIZE = 10

type FailedRecord = {
  id: string
  userId: string
  providerMessageId: string
  threadId: string | null
  receivedAt: Date
  subject: string
  sender: string
  errorReason: string
  retryCount: number
  status: string
  firstFailedAt: Date
  lastFailedAt: Date
  resolvedAt: null
}

function makeFailedRecord(providerMessageId: string, overrides: Partial<FailedRecord> = {}): FailedRecord {
  return {
    id: `failed-${providerMessageId}`,
    userId: 'user-1',
    providerMessageId,
    threadId: `thread-${providerMessageId}`,
    receivedAt: new Date('2024-01-15T10:00:00Z'),
    subject: `Subject for ${providerMessageId}`,
    sender: 'sender@example.com',
    errorReason: 'DB write failed',
    retryCount: 0,
    status: 'pending',
    firstFailedAt: new Date(),
    lastFailedAt: new Date(),
    resolvedAt: null,
    ...overrides,
  }
}

function makeStoredEmail(id: string) {
  return { id, subject: 'Test', sender: 'x@x.com', receivedAt: new Date(), bodyPreview: '', bodyFull: '', labels: '[]', threadId: null }
}

// ---------------------------------------------------------------------------
// Default setup — all mocks return safe no-ops unless overridden
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(emailRepo.fixStuckEmails).mockResolvedValue(0)
  vi.mocked(failedRepo.loadPendingFailures).mockResolvedValue([])
  vi.mocked(failedRepo.resolveFailedEmail).mockResolvedValue(undefined as any)
  vi.mocked(failedRepo.recordRetryFailure).mockResolvedValue(undefined as any)
  vi.mocked(emailRepo.storeEmail).mockResolvedValue({ email: makeStoredEmail('e') as any, wasCreated: true })
})

// ---------------------------------------------------------------------------
// Scenario 1 — No failed emails
// ---------------------------------------------------------------------------

describe('retryFailedEmails — no pending records', () => {
  it('does not call storeEmail when there are no failed records', async () => {
    vi.mocked(failedRepo.loadPendingFailures).mockResolvedValue([])

    await syncEmailsPhase2('user-1', [])

    expect(emailRepo.storeEmail).not.toHaveBeenCalled()
  })

  it('does not call resolveFailedEmail or recordRetryFailure', async () => {
    vi.mocked(failedRepo.loadPendingFailures).mockResolvedValue([])

    await syncEmailsPhase2('user-1', [])

    expect(failedRepo.resolveFailedEmail).not.toHaveBeenCalled()
    expect(failedRepo.recordRetryFailure).not.toHaveBeenCalled()
  })

  it('completes without throwing', async () => {
    vi.mocked(failedRepo.loadPendingFailures).mockResolvedValue([])
    await expect(syncEmailsPhase2('user-1', [])).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Scenario 2 — Successful retry
// ---------------------------------------------------------------------------

describe('retryFailedEmails — successful recovery', () => {
  it('calls storeEmail once per pending record', async () => {
    vi.mocked(failedRepo.loadPendingFailures).mockResolvedValue([
      makeFailedRecord('msg-1'),
      makeFailedRecord('msg-2'),
    ])

    await syncEmailsPhase2('user-1', [])

    expect(emailRepo.storeEmail).toHaveBeenCalledTimes(2)
  })

  it('passes the original providerMessageId to storeEmail', async () => {
    vi.mocked(failedRepo.loadPendingFailures).mockResolvedValue([makeFailedRecord('original-msg-id')])

    await syncEmailsPhase2('user-1', [])

    expect(emailRepo.storeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        message: expect.objectContaining({ providerMessageId: 'original-msg-id' }),
      })
    )
  })

  it('preserves original subject, sender, and threadId in the retry message', async () => {
    const record = makeFailedRecord('msg-x', {
      subject: 'Important contract deadline',
      sender: 'legal@acme.com',
      threadId: 'thread-contract',
    })
    vi.mocked(failedRepo.loadPendingFailures).mockResolvedValue([record])

    await syncEmailsPhase2('user-1', [])

    expect(emailRepo.storeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          subject: 'Important contract deadline',
          sender: 'legal@acme.com',
          threadId: 'thread-contract',
        }),
      })
    )
  })

  it('calls resolveFailedEmail after a successful store', async () => {
    vi.mocked(failedRepo.loadPendingFailures).mockResolvedValue([makeFailedRecord('msg-ok')])

    await syncEmailsPhase2('user-1', [])

    expect(failedRepo.resolveFailedEmail).toHaveBeenCalledWith('user-1', 'msg-ok')
    expect(failedRepo.recordRetryFailure).not.toHaveBeenCalled()
  })

  it('resolves even when storeEmail returns wasCreated: false (already in DB)', async () => {
    vi.mocked(failedRepo.loadPendingFailures).mockResolvedValue([makeFailedRecord('msg-dup')])
    vi.mocked(emailRepo.storeEmail).mockResolvedValue({ email: makeStoredEmail('e') as any, wasCreated: false })

    await syncEmailsPhase2('user-1', [])

    // "already exists" is still a success — the email is in the DB, so resolve it
    expect(failedRepo.resolveFailedEmail).toHaveBeenCalledWith('user-1', 'msg-dup')
    expect(failedRepo.recordRetryFailure).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Scenario 3 — Failed retry
// ---------------------------------------------------------------------------

describe('retryFailedEmails — retry still fails', () => {
  it('calls recordRetryFailure when storeEmail throws', async () => {
    vi.mocked(failedRepo.loadPendingFailures).mockResolvedValue([makeFailedRecord('msg-broken')])
    vi.mocked(emailRepo.storeEmail).mockRejectedValue(new Error('unique constraint violation'))

    await syncEmailsPhase2('user-1', [])

    expect(failedRepo.recordRetryFailure).toHaveBeenCalledWith(
      'user-1',
      'msg-broken',
      expect.stringContaining('unique constraint')
    )
    expect(failedRepo.resolveFailedEmail).not.toHaveBeenCalled()
  })

  it('records the error reason string in recordRetryFailure', async () => {
    vi.mocked(failedRepo.loadPendingFailures).mockResolvedValue([makeFailedRecord('msg-err')])
    vi.mocked(emailRepo.storeEmail).mockRejectedValue(new Error('disk full'))

    await syncEmailsPhase2('user-1', [])

    const [, , reason] = vi.mocked(failedRepo.recordRetryFailure).mock.calls[0]
    expect(reason).toBe('disk full')
  })

  it('does not throw even when both storeEmail and recordRetryFailure fail', async () => {
    vi.mocked(failedRepo.loadPendingFailures).mockResolvedValue([makeFailedRecord('msg-double-fail')])
    vi.mocked(emailRepo.storeEmail).mockRejectedValue(new Error('store failed'))
    vi.mocked(failedRepo.recordRetryFailure).mockRejectedValue(new Error('record also failed'))

    await expect(syncEmailsPhase2('user-1', [])).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Scenario 4 — Partial success
// ---------------------------------------------------------------------------

describe('retryFailedEmails — partial success / partial failure', () => {
  it('resolves the successes and records the failures independently', async () => {
    vi.mocked(failedRepo.loadPendingFailures).mockResolvedValue([
      makeFailedRecord('msg-ok-1'),
      makeFailedRecord('msg-fail'),
      makeFailedRecord('msg-ok-2'),
    ])
    vi.mocked(emailRepo.storeEmail)
      .mockResolvedValueOnce({ email: makeStoredEmail('e1') as any, wasCreated: true })
      .mockRejectedValueOnce(new Error('transient error'))
      .mockResolvedValueOnce({ email: makeStoredEmail('e2') as any, wasCreated: true })

    await syncEmailsPhase2('user-1', [])

    expect(failedRepo.resolveFailedEmail).toHaveBeenCalledTimes(2)
    expect(failedRepo.resolveFailedEmail).toHaveBeenCalledWith('user-1', 'msg-ok-1')
    expect(failedRepo.resolveFailedEmail).toHaveBeenCalledWith('user-1', 'msg-ok-2')

    expect(failedRepo.recordRetryFailure).toHaveBeenCalledTimes(1)
    expect(failedRepo.recordRetryFailure).toHaveBeenCalledWith('user-1', 'msg-fail', expect.any(String))
  })

  it('continues processing remaining records after a single failure', async () => {
    vi.mocked(failedRepo.loadPendingFailures).mockResolvedValue([
      makeFailedRecord('a'),
      makeFailedRecord('b'),  // will fail
      makeFailedRecord('c'),
      makeFailedRecord('d'),
    ])
    vi.mocked(emailRepo.storeEmail)
      .mockResolvedValueOnce({ email: makeStoredEmail('e') as any, wasCreated: true })
      .mockRejectedValueOnce(new Error('b failed'))
      .mockResolvedValueOnce({ email: makeStoredEmail('e') as any, wasCreated: true })
      .mockResolvedValueOnce({ email: makeStoredEmail('e') as any, wasCreated: true })

    await syncEmailsPhase2('user-1', [])

    // All 4 records were attempted despite the failure in position 2
    expect(emailRepo.storeEmail).toHaveBeenCalledTimes(4)
    expect(failedRepo.resolveFailedEmail).toHaveBeenCalledTimes(3)
    expect(failedRepo.recordRetryFailure).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Scenario 5 — loadPendingFailures itself fails
// ---------------------------------------------------------------------------

describe('retryFailedEmails — loadPendingFailures throws', () => {
  it('does not call storeEmail when loading the queue fails', async () => {
    vi.mocked(failedRepo.loadPendingFailures).mockRejectedValue(new Error('DB connection lost'))

    await syncEmailsPhase2('user-1', [])

    expect(emailRepo.storeEmail).not.toHaveBeenCalled()
  })

  it('does not throw — the phase2 function still completes', async () => {
    vi.mocked(failedRepo.loadPendingFailures).mockRejectedValue(new Error('DB gone'))
    await expect(syncEmailsPhase2('user-1', [])).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Scenario 6 — Batch size cap (RETRY_BATCH_SIZE = 10)
// ---------------------------------------------------------------------------

describe('retryFailedEmails — batch size cap', () => {
  it(`processes at most ${RETRY_BATCH_SIZE} records per run`, async () => {
    const manyRecords = Array.from({ length: 15 }, (_, i) => makeFailedRecord(`msg-${i}`))
    vi.mocked(failedRepo.loadPendingFailures).mockResolvedValue(manyRecords as any)

    await syncEmailsPhase2('user-1', [])

    expect(emailRepo.storeEmail).toHaveBeenCalledTimes(RETRY_BATCH_SIZE)
  })

  it('processes all records when count is below the cap', async () => {
    const fewRecords = Array.from({ length: 3 }, (_, i) => makeFailedRecord(`msg-${i}`))
    vi.mocked(failedRepo.loadPendingFailures).mockResolvedValue(fewRecords as any)

    await syncEmailsPhase2('user-1', [])

    expect(emailRepo.storeEmail).toHaveBeenCalledTimes(3)
  })

  it('takes the OLDEST records first (order preserved from loadPendingFailures)', async () => {
    // loadPendingFailures already returns in firstFailedAt ASC order (per the repo).
    // We verify the retry respects that order by checking which records are capped out.
    const records = Array.from({ length: 12 }, (_, i) =>
      makeFailedRecord(`msg-${String(i).padStart(2, '0')}`)
    )
    vi.mocked(failedRepo.loadPendingFailures).mockResolvedValue(records as any)

    await syncEmailsPhase2('user-1', [])

    const calledIds = vi.mocked(emailRepo.storeEmail).mock.calls.map(
      (call) => call[0].message.providerMessageId
    )
    // First 10 should be processed, last 2 should be skipped
    expect(calledIds).toEqual(records.slice(0, 10).map((r) => r.providerMessageId))
  })
})

// ---------------------------------------------------------------------------
// Scenario 7 — Null / missing fields in the failed record
// ---------------------------------------------------------------------------

describe('retryFailedEmails — graceful handling of incomplete records', () => {
  it('uses fallback subject when record has null subject', async () => {
    vi.mocked(failedRepo.loadPendingFailures).mockResolvedValue([
      makeFailedRecord('msg-null-subj', { subject: null as any }),
    ])

    await syncEmailsPhase2('user-1', [])

    expect(emailRepo.storeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({ subject: '(no subject)' }),
      })
    )
  })

  it('uses fallback sender when record has null sender', async () => {
    vi.mocked(failedRepo.loadPendingFailures).mockResolvedValue([
      makeFailedRecord('msg-null-sender', { sender: null as any }),
    ])

    await syncEmailsPhase2('user-1', [])

    expect(emailRepo.storeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({ sender: '' }),
      })
    )
  })

  it('uses current date as fallback when receivedAt is null', async () => {
    const before = Date.now()
    vi.mocked(failedRepo.loadPendingFailures).mockResolvedValue([
      makeFailedRecord('msg-null-date', { receivedAt: null as any }),
    ])

    await syncEmailsPhase2('user-1', [])

    const after = Date.now()
    const receivedAt: Date = vi.mocked(emailRepo.storeEmail).mock.calls[0][0].message.receivedAt as Date
    expect(receivedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(receivedAt.getTime()).toBeLessThanOrEqual(after)
  })
})
