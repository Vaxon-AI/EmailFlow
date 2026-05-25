import { beforeEach, describe, expect, it, vi } from 'vitest'

const { afterMock } = vi.hoisted(() => ({
  afterMock: vi.fn(),
}))

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    after: afterMock,
  }
})

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

vi.mock('@/repositories/email-repo', () => ({
  findEmailById: vi.fn(),
  setEmailBucket: vi.fn(),
  restoreAwaitingReview: vi.fn(),
}))

vi.mock('@/workflows', () => ({
  createTaskFromClassifiedEmail: vi.fn(),
  processEmail: vi.fn(),
}))

vi.mock('@/lib/quota', () => ({
  FREE_EXTRACT_LIMIT: 10,
  getExtractRemaining: vi.fn(),
  incrementExtractUsed: vi.fn(),
}))

import { getAuthUser } from '@/lib/api-helpers'
import * as emailRepo from '@/repositories/email-repo'
import { getExtractRemaining, incrementExtractUsed } from '@/lib/quota'
import { createTaskFromClassifiedEmail, processEmail } from '@/workflows'
import { POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockFindEmailById = vi.mocked(emailRepo.findEmailById)
const mockSetEmailBucket = vi.mocked(emailRepo.setEmailBucket)
const mockRestoreAwaitingReview = vi.mocked(emailRepo.restoreAwaitingReview)
const mockCreateTaskFromClassifiedEmail = vi.mocked(createTaskFromClassifiedEmail)
const mockProcessEmail = vi.mocked(processEmail)
const mockGetExtractRemaining = vi.mocked(getExtractRemaining)
const mockIncrementExtractUsed = vi.mocked(incrementExtractUsed)

function makeEmail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'email-1',
    subject: 'Review contract',
    sender: 'sender@example.com',
    receivedAt: new Date('2026-05-01T10:00:00Z'),
    bodyPreview: 'Please review the contract and send comments.',
    bodyFull: 'Please review the contract and send comments before Friday.',
    labels: '[]',
    threadId: 'thread-1',
    classification: 'action',
    awaitingReview: false,
    taskLinks: [],
    ...overrides,
  }
}

function makePipelineResult(overrides: Record<string, unknown> = {}) {
  return {
    emailId: 'email-1',
    classification: 'action',
    confidence: 0.9,
    taskCreated: false,
    taskIds: [],
    createdTaskIds: [],
    dedupedTaskIds: [],
    skippedByRule: false,
    ...overrides,
  }
}

describe('POST /api/emails/[id]/extract-task', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1', plan: 'pro' } as never)
    mockSetEmailBucket.mockResolvedValue({} as never)
    mockRestoreAwaitingReview.mockResolvedValue({} as never)
    mockCreateTaskFromClassifiedEmail.mockResolvedValue(makePipelineResult() as never)
    mockProcessEmail.mockResolvedValue(makePipelineResult() as never)
    mockGetExtractRemaining.mockResolvedValue(Infinity)
    mockIncrementExtractUsed.mockResolvedValue(undefined)
    afterMock.mockImplementation((callback: () => void | Promise<void>) => {
      void callback()
    })
  })

  it('queues pending AI suggestion extraction for action emails without prematurely bucketing them', async () => {
    mockFindEmailById.mockResolvedValue(makeEmail() as never)
    mockProcessEmail.mockResolvedValue(
      makePipelineResult({ taskIds: ['task-1'], createdTaskIds: ['task-1'], taskCreated: true }) as never
    )

    const res = await POST(new Request('http://localhost/api/emails/email-1/extract-task', { method: 'POST' }), {
      params: Promise.resolve({ id: 'email-1' }),
    })

    expect(res.status).toBe(200)
    // The route no longer flips the bucket up-front; the pipeline marks
    // actioned only when a task is actually created/linked.
    expect(mockSetEmailBucket).not.toHaveBeenCalled()
    expect(mockProcessEmail).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        id: 'email-1',
        taskStatus: 'ai_suggestion',
        forceAction: true,
      })
    )
  })

  it('allows uncertain emails and queues pending extraction without bucketing them', async () => {
    mockFindEmailById.mockResolvedValue(makeEmail({ classification: 'uncertain' }) as never)

    const res = await POST(new Request('http://localhost/api/emails/email-1/extract-task', { method: 'POST' }), {
      params: Promise.resolve({ id: 'email-1' }),
    })

    expect(res.status).toBe(200)
    expect(mockSetEmailBucket).not.toHaveBeenCalled()
    expect(mockProcessEmail).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        id: 'email-1',
        taskStatus: 'ai_suggestion',
        forceAction: true,
      })
    )
  })

  it('leaves the email untouched when the pipeline reports no candidates', async () => {
    mockFindEmailById.mockResolvedValue(makeEmail() as never)
    mockProcessEmail.mockResolvedValue(makePipelineResult({ noCandidates: true }) as never)

    const res = await POST(new Request('http://localhost/api/emails/email-1/extract-task', { method: 'POST' }), {
      params: Promise.resolve({ id: 'email-1' }),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: { created: number; deduped: number; noCandidates: boolean } }
    expect(json.data.created).toBe(0)
    expect(json.data.deduped).toBe(0)
    expect(json.data.noCandidates).toBe(true)
    expect(mockSetEmailBucket).not.toHaveBeenCalled()
    expect(mockRestoreAwaitingReview).not.toHaveBeenCalled()
  })

  it('keeps awaiting review action emails on the pending AI suggestion path', async () => {
    mockFindEmailById.mockResolvedValue(makeEmail({ awaitingReview: true }) as never)
    mockCreateTaskFromClassifiedEmail.mockResolvedValue(
      makePipelineResult({ taskIds: ['task-1'], createdTaskIds: ['task-1'], taskCreated: true }) as never
    )

    const res = await POST(new Request('http://localhost/api/emails/email-1/extract-task', { method: 'POST' }), {
      params: Promise.resolve({ id: 'email-1' }),
    })

    expect(res.status).toBe(200)
    expect(mockCreateTaskFromClassifiedEmail).toHaveBeenCalledWith('user-1', 'email-1', 'ai_suggestion')
    expect(mockProcessEmail).not.toHaveBeenCalled()
    expect(mockSetEmailBucket).not.toHaveBeenCalled()
    expect(mockRestoreAwaitingReview).not.toHaveBeenCalled()
  })

  it('restores awaitingReview when the review-path extraction yields no candidates', async () => {
    mockFindEmailById.mockResolvedValue(makeEmail({ awaitingReview: true }) as never)
    mockCreateTaskFromClassifiedEmail.mockResolvedValue(
      makePipelineResult({ noCandidates: true }) as never
    )

    const res = await POST(new Request('http://localhost/api/emails/email-1/extract-task', { method: 'POST' }), {
      params: Promise.resolve({ id: 'email-1' }),
    })

    expect(res.status).toBe(200)
    expect(mockRestoreAwaitingReview).toHaveBeenCalledWith('email-1')
    expect(mockSetEmailBucket).not.toHaveBeenCalled()
  })

  it('does not restore awaitingReview when the review-path extraction produces a task', async () => {
    mockFindEmailById.mockResolvedValue(makeEmail({ awaitingReview: true }) as never)
    mockCreateTaskFromClassifiedEmail.mockResolvedValue(
      makePipelineResult({ taskIds: ['task-1'], createdTaskIds: ['task-1'], taskCreated: true }) as never
    )

    const res = await POST(new Request('http://localhost/api/emails/email-1/extract-task', { method: 'POST' }), {
      params: Promise.resolve({ id: 'email-1' }),
    })

    expect(res.status).toBe(200)
    expect(mockRestoreAwaitingReview).not.toHaveBeenCalled()
  })

  it('handles the alreadyClaimed concurrent-click race without restoring awaitingReview', async () => {
    mockFindEmailById.mockResolvedValue(makeEmail({ awaitingReview: true }) as never)
    mockCreateTaskFromClassifiedEmail.mockResolvedValue(null as never)

    const res = await POST(new Request('http://localhost/api/emails/email-1/extract-task', { method: 'POST' }), {
      params: Promise.resolve({ id: 'email-1' }),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: { alreadyClaimed?: boolean } }
    expect(json.data.alreadyClaimed).toBe(true)
    expect(mockRestoreAwaitingReview).not.toHaveBeenCalled()
  })

  it('rejects FYI and ignored emails', async () => {
    mockFindEmailById.mockResolvedValue(makeEmail({ classification: 'awareness' }) as never)

    const res = await POST(new Request('http://localhost/api/emails/email-1/extract-task', { method: 'POST' }), {
      params: Promise.resolve({ id: 'email-1' }),
    })

    expect(res.status).toBe(400)
    expect(mockProcessEmail).not.toHaveBeenCalled()
    expect(mockSetEmailBucket).not.toHaveBeenCalled()
  })

  describe('quota tracking for free users', () => {
    it('increments extractUsed after a successful extraction', async () => {
      mockGetAuthUser.mockResolvedValue({ id: 'user-1', plan: 'free' } as never)
      mockFindEmailById.mockResolvedValue(makeEmail() as never)
      mockProcessEmail.mockResolvedValue(
        makePipelineResult({ taskIds: ['task-1'], createdTaskIds: ['task-1'], taskCreated: true }) as never
      )

      const res = await POST(new Request('http://localhost/api/emails/email-1/extract-task', { method: 'POST' }), {
        params: Promise.resolve({ id: 'email-1' }),
      })

      expect(res.status).toBe(200)
      expect(mockIncrementExtractUsed).toHaveBeenCalledWith('user-1')
    })

    it('increments extractUsed when the pipeline dedupes onto an existing task', async () => {
      mockGetAuthUser.mockResolvedValue({ id: 'user-1', plan: 'free' } as never)
      mockFindEmailById.mockResolvedValue(makeEmail() as never)
      mockProcessEmail.mockResolvedValue(
        makePipelineResult({ taskIds: ['task-1'], dedupedTaskIds: ['task-1'] }) as never
      )

      const res = await POST(new Request('http://localhost/api/emails/email-1/extract-task', { method: 'POST' }), {
        params: Promise.resolve({ id: 'email-1' }),
      })

      expect(res.status).toBe(200)
      expect(mockIncrementExtractUsed).toHaveBeenCalledWith('user-1')
    })

    it('does not increment when the pipeline reports no candidates', async () => {
      mockGetAuthUser.mockResolvedValue({ id: 'user-1', plan: 'free' } as never)
      mockFindEmailById.mockResolvedValue(makeEmail() as never)
      mockProcessEmail.mockResolvedValue(makePipelineResult({ noCandidates: true }) as never)

      const res = await POST(new Request('http://localhost/api/emails/email-1/extract-task', { method: 'POST' }), {
        params: Promise.resolve({ id: 'email-1' }),
      })

      expect(res.status).toBe(200)
      expect(mockIncrementExtractUsed).not.toHaveBeenCalled()
    })

    it('returns 402 when the free quota is exhausted', async () => {
      mockGetAuthUser.mockResolvedValue({ id: 'user-1', plan: 'free' } as never)
      mockFindEmailById.mockResolvedValue(makeEmail() as never)
      mockGetExtractRemaining.mockResolvedValue(0)

      const res = await POST(new Request('http://localhost/api/emails/email-1/extract-task', { method: 'POST' }), {
        params: Promise.resolve({ id: 'email-1' }),
      })

      expect(res.status).toBe(402)
      expect(mockProcessEmail).not.toHaveBeenCalled()
      expect(mockIncrementExtractUsed).not.toHaveBeenCalled()
    })

    it('increments extractUsed on the awaitingReview path when a task is created', async () => {
      mockGetAuthUser.mockResolvedValue({ id: 'user-1', plan: 'free' } as never)
      mockFindEmailById.mockResolvedValue(makeEmail({ awaitingReview: true }) as never)
      mockCreateTaskFromClassifiedEmail.mockResolvedValue(
        makePipelineResult({ taskIds: ['task-1'], createdTaskIds: ['task-1'], taskCreated: true }) as never
      )

      const res = await POST(new Request('http://localhost/api/emails/email-1/extract-task', { method: 'POST' }), {
        params: Promise.resolve({ id: 'email-1' }),
      })

      expect(res.status).toBe(200)
      expect(mockIncrementExtractUsed).toHaveBeenCalledWith('user-1')
    })

    it('does not increment on the awaitingReview alreadyClaimed race', async () => {
      mockGetAuthUser.mockResolvedValue({ id: 'user-1', plan: 'free' } as never)
      mockFindEmailById.mockResolvedValue(makeEmail({ awaitingReview: true }) as never)
      mockCreateTaskFromClassifiedEmail.mockResolvedValue(null as never)

      const res = await POST(new Request('http://localhost/api/emails/email-1/extract-task', { method: 'POST' }), {
        params: Promise.resolve({ id: 'email-1' }),
      })

      expect(res.status).toBe(200)
      expect(mockIncrementExtractUsed).not.toHaveBeenCalled()
    })

    it('does not increment for pro users', async () => {
      mockGetAuthUser.mockResolvedValue({ id: 'user-1', plan: 'pro' } as never)
      mockFindEmailById.mockResolvedValue(makeEmail() as never)
      mockProcessEmail.mockResolvedValue(
        makePipelineResult({ taskIds: ['task-1'], createdTaskIds: ['task-1'], taskCreated: true }) as never
      )

      const res = await POST(new Request('http://localhost/api/emails/email-1/extract-task', { method: 'POST' }), {
        params: Promise.resolve({ id: 'email-1' }),
      })

      expect(res.status).toBe(200)
      expect(mockGetExtractRemaining).not.toHaveBeenCalled()
      expect(mockIncrementExtractUsed).not.toHaveBeenCalled()
    })
  })

  it('reprocesses when an active task is already linked so workflow can dedupe', async () => {
    mockFindEmailById.mockResolvedValue(
      makeEmail({
        taskLinks: [{ task: { id: 'task-1', status: 'ai_suggestion' } }],
      }) as never
    )
    mockProcessEmail.mockResolvedValue(
      makePipelineResult({ taskIds: ['task-1'], dedupedTaskIds: ['task-1'] }) as never
    )

    const res = await POST(new Request('http://localhost/api/emails/email-1/extract-task', { method: 'POST' }), {
      params: Promise.resolve({ id: 'email-1' }),
    })

    expect(res.status).toBe(200)
    expect(mockSetEmailBucket).not.toHaveBeenCalled()
    expect(mockProcessEmail).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        id: 'email-1',
        taskStatus: 'ai_suggestion',
        forceAction: true,
      })
    )
  })
})
