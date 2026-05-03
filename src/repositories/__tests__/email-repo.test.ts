import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that reference them
// ---------------------------------------------------------------------------

vi.mock('@/lib/prisma', () => ({
  prisma: {
    email: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
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
  markClassificationFailed,
  fixStuckEmails,
} from '../email-repo'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockPrismaEmail = vi.mocked(prisma.email)

function makeMessage(id = 'gmail-msg-1') {
  return {
    providerMessageId: id,
    threadId: `thread-${id}`,
    subject: 'Test Subject',
    sender: 'alice@example.com',
    recipients: ['bob@example.com'],
    bodyPreview: 'Hello...',
    bodyFull: 'Hello World',
    receivedAt: new Date('2024-01-15T10:00:00Z'),
    labels: ['INBOX'],
    hasAttachments: false,
    providerCategories: [] as const,
  }
}

const EXISTING_EMAIL = { id: 'email-1', gmailMessageId: 'gmail-msg-1' }
const CREATED_EMAIL = { id: 'email-new', gmailMessageId: 'gmail-msg-2' }

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

describe('storeEmail — dedup logic', () => {
  it('returns wasCreated: false and the existing record without calling create', async () => {
    mockPrismaEmail.findUnique.mockResolvedValue(EXISTING_EMAIL as any)

    const result = await storeEmail({ userId: 'user-1', message: makeMessage() })

    expect(result.wasCreated).toBe(false)
    expect(result.email).toEqual(EXISTING_EMAIL)
    expect(mockPrismaEmail.create).not.toHaveBeenCalled()
  })

  it('calls create and returns wasCreated: true for a new message ID', async () => {
    mockPrismaEmail.findUnique.mockResolvedValue(null)
    mockPrismaEmail.create.mockResolvedValue(CREATED_EMAIL as any)

    const result = await storeEmail({ userId: 'user-1', message: makeMessage('gmail-msg-2') })

    expect(result.wasCreated).toBe(true)
    expect(mockPrismaEmail.create).toHaveBeenCalledOnce()
  })

  it('passes the correct userId and gmailMessageId to create', async () => {
    mockPrismaEmail.findUnique.mockResolvedValue(null)
    mockPrismaEmail.create.mockResolvedValue(CREATED_EMAIL as any)

    await storeEmail({ userId: 'user-42', message: makeMessage('msg-x') })

    expect(mockPrismaEmail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-42',
          gmailMessageId: 'msg-x',
        }),
      })
    )
  })

  it('encodes labels and recipients as JSON strings', async () => {
    mockPrismaEmail.findUnique.mockResolvedValue(null)
    mockPrismaEmail.create.mockResolvedValue(CREATED_EMAIL as any)

    const message = { ...makeMessage('msg-y'), labels: ['INBOX', 'IMPORTANT'], recipients: ['a@b.com', 'c@d.com'] }
    await storeEmail({ userId: 'user-1', message })

    const { data } = (mockPrismaEmail.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(JSON.parse(data.labels)).toEqual(['INBOX', 'IMPORTANT'])
    expect(JSON.parse(data.recipients)).toEqual(['a@b.com', 'c@d.com'])
  })

  it('sets processingStatus to "pending" on creation', async () => {
    mockPrismaEmail.findUnique.mockResolvedValue(null)
    mockPrismaEmail.create.mockResolvedValue(CREATED_EMAIL as any)

    await storeEmail({ userId: 'user-1', message: makeMessage('msg-z') })

    const { data } = (mockPrismaEmail.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(data.processingStatus).toBe('pending')
  })

  it('does not call create a second time for the same message ID', async () => {
    mockPrismaEmail.findUnique.mockResolvedValue(EXISTING_EMAIL as any)

    await storeEmail({ userId: 'user-1', message: makeMessage() })
    await storeEmail({ userId: 'user-1', message: makeMessage() })

    expect(mockPrismaEmail.create).not.toHaveBeenCalled()
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
})
