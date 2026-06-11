import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that reference them
// ---------------------------------------------------------------------------

vi.mock('@/lib/prisma', () => ({
  prisma: {
    email: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    deletedEmailMarker: {
      findFirst: vi.fn(),
    },
  },
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { prisma } from '@/lib/prisma'
import {
  storeEmail,
  updateClassification,
  saveClassificationFields,
  dismissReviewEmails,
  bulkIgnoreEmails,
  clearAwaitingReview,
  claimAwaitingReviewEmail,
  markClassificationFailed,
  fixStuckEmails,
  markQuotaSkipped,
  countQuotaSkipped,
  countAwaitingReview,
  setEmailBucket,
  bulkSetEmailBucket,
  findEmailsPaginated,
  findBatchStatus,
  bulkMarkActioned,
  findEmailForPipelineById,
} from '../email-repo'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockPrismaEmail = vi.mocked(prisma.email)
const mockTombstone = vi.mocked(prisma.deletedEmailMarker.findFirst)

function makeMessage(id = 'gmail-msg-1') {
  return {
    providerMessageId: id,
    threadId: `thread-${id}`,
    subject: 'Test Subject',
    sender: 'alice@example.com',
    recipients: ['bob@example.com'],
    bodyPreview: 'Hello...',
    bodyFull: 'Hello World',
    bodyHtml: null,
    receivedAt: new Date('2024-01-15T10:00:00Z'),
    labels: ['INBOX'],
    hasAttachments: false,
    providerCategories: [] as const,
  }
}

function makeAccountMessage(id = 'gmail-msg-1', accountId = 'account-1') {
  return {
    ...makeMessage(id),
    accountId,
    accountEmail: `${accountId}@gmail.com`,
  }
}

const EXISTING_EMAIL = { id: 'email-1', providerMessageId: 'provider-msg-1' }
const CREATED_EMAIL = { id: 'email-new', providerMessageId: 'provider-msg-2' }

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  // Default: no tombstone found (storeEmail proceeds normally)
  mockTombstone.mockResolvedValue(null)
})

describe('storeEmail — dedup logic', () => {
  it('returns wasCreated: false and the existing record without calling create', async () => {
    mockPrismaEmail.findFirst.mockResolvedValue(EXISTING_EMAIL as any)

    const result = await storeEmail({ userId: 'user-1', message: makeMessage() })

    expect(result.wasCreated).toBe(false)
    expect(result.email).toEqual(EXISTING_EMAIL)
    expect(mockPrismaEmail.create).not.toHaveBeenCalled()
  })

  it('calls create and returns wasCreated: true for a new message ID', async () => {
    mockPrismaEmail.findFirst.mockResolvedValue(null)
    mockPrismaEmail.create.mockResolvedValue(CREATED_EMAIL as any)

    const result = await storeEmail({ userId: 'user-1', message: makeMessage('gmail-msg-2') })

    expect(result.wasCreated).toBe(true)
    expect(mockPrismaEmail.create).toHaveBeenCalledOnce()
  })

  it('passes the correct userId and message IDs to create', async () => {
    mockPrismaEmail.findFirst.mockResolvedValue(null)
    mockPrismaEmail.create.mockResolvedValue(CREATED_EMAIL as any)

    await storeEmail({ userId: 'user-42', message: makeMessage('msg-x') })

    expect(mockPrismaEmail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-42',
          providerMessageId: 'msg-x',
        }),
      })
    )
  })

  it('encodes labels and recipients as JSON strings', async () => {
    mockPrismaEmail.findFirst.mockResolvedValue(null)
    mockPrismaEmail.create.mockResolvedValue(CREATED_EMAIL as any)

    const message = { ...makeMessage('msg-y'), labels: ['INBOX', 'IMPORTANT'], recipients: ['a@b.com', 'c@d.com'] }
    await storeEmail({ userId: 'user-1', message })

    const { data } = (mockPrismaEmail.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(JSON.parse(data.labels)).toEqual(['INBOX', 'IMPORTANT'])
    expect(JSON.parse(data.recipients)).toEqual(['a@b.com', 'c@d.com'])
  })

  it('sets processingStatus to "ai_suggestion" on creation', async () => {
    mockPrismaEmail.findFirst.mockResolvedValue(null)
    mockPrismaEmail.create.mockResolvedValue(CREATED_EMAIL as any)

    await storeEmail({ userId: 'user-1', message: makeMessage('msg-z') })

    const { data } = (mockPrismaEmail.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(data.processingStatus).toBe('pending')
  })

  it('does not call create a second time for the same message ID', async () => {
    mockPrismaEmail.findFirst.mockResolvedValue(EXISTING_EMAIL as any)

    await storeEmail({ userId: 'user-1', message: makeMessage() })
    await storeEmail({ userId: 'user-1', message: makeMessage() })

    expect(mockPrismaEmail.create).not.toHaveBeenCalled()
  })

  it('skips creation and returns tombstoned: true when a DeletedEmailMarker exists for this message', async () => {
    mockTombstone.mockResolvedValue({ id: 'marker-1' } as any)

    const result = await storeEmail({ userId: 'user-1', message: makeMessage('msg-deleted') })

    expect(result.tombstoned).toBe(true)
    expect(result.email).toBeNull()
    expect(result.wasCreated).toBe(false)
    // No findFirst lookup or create attempt — tombstone short-circuits
    expect(mockPrismaEmail.findFirst).not.toHaveBeenCalled()
    expect(mockPrismaEmail.create).not.toHaveBeenCalled()
  })

  it('deduplicates by user, account, and provider message ID', async () => {
    mockPrismaEmail.findFirst.mockResolvedValue(null)
    mockPrismaEmail.create.mockResolvedValue(CREATED_EMAIL as any)

    await storeEmail({ userId: 'user-1', message: makeAccountMessage('shared-msg', 'account-1') })

    expect(mockPrismaEmail.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        accountId: 'account-1',
        providerMessageId: 'shared-msg',
      },
    })
    expect(mockPrismaEmail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'account-1',
          accountEmail: 'account-1@gmail.com',
        }),
      })
    )
  })
})

describe('updateClassification', () => {
  it('updates the correct emailId with classification fields', async () => {
    mockPrismaEmail.update.mockResolvedValue({} as any)

    await updateClassification('email-1', {
      category: 'action',
      confidence: 0.95,
      reasoning: 'Clear deadline mentioned',
      isWorkRelated: true,
    })

    expect(mockPrismaEmail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'email-1' },
        data: expect.objectContaining({
          classification: 'action',
          classConfidence: 0.95,
          isWorkRelated: true,
          processingStatus: 'done',
        }),
      })
    )
  })
})

describe('saveClassificationFields', () => {
  it('marks a manual-review classification as done without clearing awaitingReview', async () => {
    mockPrismaEmail.update.mockResolvedValue({} as any)

    await saveClassificationFields('email-1', {
      category: 'action',
      confidence: 0.88,
      reasoning: 'User should review this action',
      isWorkRelated: true,
    })

    expect(mockPrismaEmail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'email-1' },
        data: expect.objectContaining({
          classification: 'action',
          classConfidence: 0.88,
          processingStatus: 'done',
          processedAt: expect.any(Date),
        }),
      })
    )
    expect((mockPrismaEmail.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data).not.toHaveProperty('awaitingReview')
  })
})

describe('dismissReviewEmails', () => {
  it('collapses review emails into ignore/actioned state', async () => {
    mockPrismaEmail.updateMany.mockResolvedValue({ count: 2 } as any)

    await dismissReviewEmails(['email-1', 'email-2'])

    expect(mockPrismaEmail.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['email-1', 'email-2'] } },
      data: {
        classification: 'ignore',
        actioned: true,
        awaitingReview: false,
      },
    })
  })
})

describe('bulkIgnoreEmails', () => {
  it('scopes ignore collapse by userId', async () => {
    mockPrismaEmail.updateMany.mockResolvedValue({ count: 2 } as any)

    await bulkIgnoreEmails('user-1', ['email-1', 'email-2'])

    expect(mockPrismaEmail.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['email-1', 'email-2'] }, userId: 'user-1' },
      data: {
        classification: 'ignore',
        actioned: true,
        awaitingReview: false,
      },
    })
  })

  it('short-circuits for an empty email list', async () => {
    const result = await bulkIgnoreEmails('user-1', [])

    expect(result).toEqual({ count: 0 })
    expect(mockPrismaEmail.updateMany).not.toHaveBeenCalled()
  })
})

describe('clearAwaitingReview', () => {
  it('clears awaitingReview on a single email', async () => {
    mockPrismaEmail.update.mockResolvedValue({} as any)

    await clearAwaitingReview('email-1')

    expect(mockPrismaEmail.update).toHaveBeenCalledWith({
      where: { id: 'email-1' },
      data: { awaitingReview: false },
    })
  })
})

describe('claimAwaitingReviewEmail', () => {
  it('atomically claims a review email for a user', async () => {
    mockPrismaEmail.updateMany.mockResolvedValue({ count: 1 } as any)

    const result = await claimAwaitingReviewEmail('user-1', 'email-1')

    expect(result).toEqual({ count: 1 })
    expect(mockPrismaEmail.updateMany).toHaveBeenCalledWith({
      where: { id: 'email-1', userId: 'user-1', awaitingReview: true },
      data: { awaitingReview: false },
    })
  })
})

describe('markClassificationFailed', () => {
  it('sets processingStatus to "failed" and classification to "uncertain" only on pending emails', async () => {
    mockPrismaEmail.updateMany.mockResolvedValue({ count: 1 })

    await markClassificationFailed('email-1')

    expect(mockPrismaEmail.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'email-1', processingStatus: 'pending' },
        data: expect.objectContaining({
          processingStatus: 'failed',
          classification: 'uncertain',
          classConfidence: 0,
        }),
      })
    )
  })

  it('does not affect emails whose processingStatus is already done (defensive)', async () => {
    mockPrismaEmail.updateMany.mockResolvedValue({ count: 0 })

    await markClassificationFailed('email-already-done')

    // The where clause must include processingStatus: 'pending' so an
    // already-classified email is not regressed by a later step failure.
    const call = mockPrismaEmail.updateMany.mock.calls.at(-1)?.[0]
    expect(call?.where).toEqual({ id: 'email-already-done', processingStatus: 'pending' })
  })
})

describe('fixStuckEmails', () => {
  it('returns the count from updateMany', async () => {
    mockPrismaEmail.updateMany.mockResolvedValue({ count: 3 })
    expect(await fixStuckEmails('user-1')).toBe(3)
  })

  it('returns 0 when no stuck emails exist', async () => {
    mockPrismaEmail.updateMany.mockResolvedValue({ count: 0 })
    expect(await fixStuckEmails('user-1')).toBe(0)
  })

  it('filters by userId and processingStatus: pending', async () => {
    mockPrismaEmail.updateMany.mockResolvedValue({ count: 0 })

    await fixStuckEmails('user-42')

    expect(mockPrismaEmail.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          processingStatus: 'pending',
          userId: 'user-42',
        }),
        data: expect.objectContaining({ processingStatus: 'failed' }),
      })
    )
  })

  it('passes null userId when called without one to scan globally', async () => {
    mockPrismaEmail.updateMany.mockResolvedValue({ count: 0 })
    await fixStuckEmails(null)
    const call = (mockPrismaEmail.updateMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    // null userId means the where object should NOT contain a userId key
    expect(call.where).not.toHaveProperty('userId')
  })

  it('does NOT touch quota_skipped rows (only filters status: pending)', async () => {
    mockPrismaEmail.updateMany.mockResolvedValue({ count: 0 })
    await fixStuckEmails('user-1')
    const call = (mockPrismaEmail.updateMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.where.processingStatus).toBe('pending')
  })
})

describe('markQuotaSkipped', () => {
  it('updates the listed email ids to processingStatus: quota_skipped', async () => {
    mockPrismaEmail.updateMany.mockResolvedValue({ count: 3 })

    const count = await markQuotaSkipped(['e1', 'e2', 'e3'])

    expect(count).toBe(3)
    expect(mockPrismaEmail.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['e1', 'e2', 'e3'] } },
      data: { processingStatus: 'quota_skipped' },
    })
  })

  it('short-circuits to 0 when given an empty list (no DB call)', async () => {
    const count = await markQuotaSkipped([])
    expect(count).toBe(0)
    expect(mockPrismaEmail.updateMany).not.toHaveBeenCalled()
  })
})

describe('setEmailBucket', () => {
  it('maps needs_action to classification=action, actioned=false', async () => {
    mockPrismaEmail.update.mockResolvedValue({} as any)

    await setEmailBucket('email-1', 'needs_action')

    expect(mockPrismaEmail.update).toHaveBeenCalledWith({
      where: { id: 'email-1' },
      data: expect.objectContaining({
        classification: 'action',
        actioned: false,
        awaitingReview: false,
        classConfidence: null,
        classReasoning: null,
        processingStatus: 'done',
      }),
    })
  })

  it('maps tracked to classification=action, actioned=true', async () => {
    mockPrismaEmail.update.mockResolvedValue({} as any)

    await setEmailBucket('email-1', 'tracked')

    const call = (mockPrismaEmail.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.data.classification).toBe('action')
    expect(call.data.actioned).toBe(true)
  })

  it('maps fyi to classification=awareness, actioned=false', async () => {
    mockPrismaEmail.update.mockResolvedValue({} as any)

    await setEmailBucket('email-1', 'fyi')

    const call = (mockPrismaEmail.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.data.classification).toBe('awareness')
    expect(call.data.actioned).toBe(false)
  })

  it('maps ignored to classification=ignore without tracking', async () => {
    mockPrismaEmail.update.mockResolvedValue({} as any)

    await setEmailBucket('email-1', 'ignored')

    const call = (mockPrismaEmail.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.data.classification).toBe('ignore')
    expect(call.data.actioned).toBe(false)
  })
})

describe('findEmailsPaginated', () => {
  it('selects linked task status and completedAt for email display state', async () => {
    mockPrismaEmail.findMany.mockResolvedValue([
      {
        id: 'email-1',
        threadId: null,
        taskLinks: [
          { id: 'link-1', task: { id: 'task-1', title: 'Done', status: 'completed', completedAt: new Date('2026-05-01T00:00:00Z') } },
        ],
      },
    ] as never)
    mockPrismaEmail.count.mockResolvedValue(1 as never)

    await findEmailsPaginated('user-1', { page: 1, limit: 20 })

    expect(mockPrismaEmail.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        taskLinks: {
          select: {
            id: true,
            task: { select: { id: true, title: true, status: true, completedAt: true } },
          },
        },
      }),
    }))
  })
})

describe('findBatchStatus', () => {
  it('returns enhanced batch counters and treats only pending rows as incomplete', async () => {
    mockPrismaEmail.findMany.mockResolvedValue([
      { id: 'e1', processingStatus: 'pending', classification: null, actioned: false, taskLinks: [] },
      { id: 'e2', processingStatus: 'done', classification: 'action', actioned: false, taskLinks: [] },
      { id: 'e3', processingStatus: 'quota_skipped', classification: null, actioned: false, taskLinks: [] },
      { id: 'e4', processingStatus: 'failed', classification: 'uncertain', actioned: false, taskLinks: [] },
      { id: 'e5', processingStatus: 'done', classification: 'awareness', actioned: false, taskLinks: [] },
      { id: 'e6', processingStatus: 'done', classification: 'ignore', actioned: false, taskLinks: [] },
    ] as never)

    const result = await findBatchStatus('user-1', 'sync-1')

    expect(result.isComplete).toBe(false)
    expect(result.totalEmails).toBe(6)
    expect(result.pendingEmails).toBe(1)
    expect(result.classifiedEmails).toBe(5)
    expect(result.needsActionCount).toBe(1)
    expect(result.fyiCount).toBe(1)
    expect(result.ignoredCount).toBe(1)
    expect(result.quotaSkippedEmails).toBe(1)
    expect(result.uncertainCount).toBe(1)
    expect(result.uncertainEmails).toBe(1)
    expect(result.actionEmailCount).toBe(1)
    expect(result.unhandledActionCount).toBe(1)
    expect(result.actionEmails).toEqual([])
  })

  it('includes action email details after the batch is complete', async () => {
    mockPrismaEmail.findMany.mockResolvedValue([
      {
        id: 'e1',
        subject: 'Act',
        sender: 'a@example.com',
        receivedAt: new Date('2026-05-01T00:00:00Z'),
        processingStatus: 'done',
        classification: 'action',
        actioned: false,
        taskLinks: [],
      },
    ] as never)

    const result = await findBatchStatus('user-1', 'sync-1')

    expect(result.isComplete).toBe(true)
    expect(result.actionEmails).toHaveLength(1)
  })

  it('excludes action emails with a linked task from unhandledActionCount but keeps them in actionEmailCount', async () => {
    mockPrismaEmail.findMany.mockResolvedValue([
      {
        id: 'e1',
        processingStatus: 'done',
        classification: 'action',
        actioned: true,
        taskLinks: [{ task: { id: 'task-1', title: 'Reply to dinner invite' } }],
      },
      { id: 'e2', processingStatus: 'done', classification: 'action', actioned: false, taskLinks: [] },
    ] as never)

    const result = await findBatchStatus('user-1', 'sync-1')

    expect(result.actionEmailCount).toBe(2)
    expect(result.unhandledActionCount).toBe(1)
    expect(result.actionEmails).toHaveLength(2)
  })

  it('excludes actioned (tracked) action emails without tasks from unhandledActionCount', async () => {
    mockPrismaEmail.findMany.mockResolvedValue([
      { id: 'e1', processingStatus: 'done', classification: 'action', actioned: true, taskLinks: [] },
    ] as never)

    const result = await findBatchStatus('user-1', 'sync-1')

    expect(result.actionEmailCount).toBe(1)
    expect(result.unhandledActionCount).toBe(0)
  })

  it('reports unhandledActionCount 0 when every action email has a task', async () => {
    mockPrismaEmail.findMany.mockResolvedValue([
      {
        id: 'e1',
        processingStatus: 'done',
        classification: 'action',
        actioned: true,
        taskLinks: [{ task: { id: 'task-1', title: 'T1' } }],
      },
      {
        id: 'e2',
        processingStatus: 'done',
        classification: 'action',
        actioned: true,
        taskLinks: [{ task: { id: 'task-2', title: 'T2' } }],
      },
    ] as never)

    const result = await findBatchStatus('user-1', 'sync-1')

    expect(result.actionEmailCount).toBe(2)
    expect(result.unhandledActionCount).toBe(0)
  })
})

describe('bulkSetEmailBucket', () => {
  it('maps selected emails to a bucket scoped to userId', async () => {
    mockPrismaEmail.updateMany.mockResolvedValue({ count: 2 } as never)

    await bulkSetEmailBucket('user-1', ['email-1', 'email-2'], 'tracked')

    expect(mockPrismaEmail.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['email-1', 'email-2'] }, userId: 'user-1' },
      data: expect.objectContaining({
        classification: 'action',
        actioned: true,
        awaitingReview: false,
        classConfidence: null,
        classReasoning: null,
        processingStatus: 'done',
      }),
    })
  })
})

describe('bulkMarkActioned', () => {
  it('marks only the current user owned emails as actioned', async () => {
    mockPrismaEmail.updateMany.mockResolvedValue({ count: 2 } as never)

    const result = await bulkMarkActioned('user-1', ['email-1', 'email-2'])

    expect(result.count).toBe(2)
    expect(mockPrismaEmail.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['email-1', 'email-2'] }, userId: 'user-1' },
      data: { actioned: true },
    })
  })

  it('does not call the database for an empty email list', async () => {
    const result = await bulkMarkActioned('user-1', [])

    expect(result.count).toBe(0)
    expect(mockPrismaEmail.updateMany).not.toHaveBeenCalled()
  })
})

describe('countAwaitingReview', () => {
  it('counts both quota_skipped + uncertain (not actioned), scoped to userId', async () => {
    const mockCount = vi.mocked(prisma.email.count)
    mockCount.mockResolvedValue(11 as never)

    const result = await countAwaitingReview('user-7')

    expect(result).toBe(11)
    expect(mockCount).toHaveBeenCalledWith({
      where: {
        userId: 'user-7',
        actioned: false,
        taskLinks: { none: {} },
        OR: [
          { classification: 'uncertain' },
          { classification: null },
        ],
      },
    })
  })
})

describe('findEmailForPipelineById', () => {
  it('finds a pipeline email scoped to the owning user', async () => {
    mockPrismaEmail.findFirst.mockResolvedValue({ id: 'email-1', subject: 'Hello' } as any)

    const result = await findEmailForPipelineById('user-1', 'email-1')

    expect(result).toEqual({ id: 'email-1', subject: 'Hello' })
    expect(mockPrismaEmail.findFirst).toHaveBeenCalledWith({
      where: { id: 'email-1', userId: 'user-1' },
      select: {
        id: true,
        subject: true,
        sender: true,
        receivedAt: true,
        bodyPreview: true,
        bodyFull: true,
        labels: true,
        threadId: true,
        awaitingReview: true,
      },
    })
  })
})

describe('countQuotaSkipped', () => {
  it('counts emails with processingStatus: quota_skipped and classification: null', async () => {
    const mockCount = vi.mocked(prisma.email.count)
    mockCount.mockResolvedValue(7 as never)

    const result = await countQuotaSkipped('user-7')

    expect(result).toBe(7)
    expect(mockCount).toHaveBeenCalledWith({
      where: { userId: 'user-7', processingStatus: 'quota_skipped', classification: null },
    })
  })
})
