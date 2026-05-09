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
}))

vi.mock('@/workflows', () => ({
  createTaskFromClassifiedEmail: vi.fn(),
  processEmail: vi.fn(),
}))

import { getAuthUser } from '@/lib/api-helpers'
import * as emailRepo from '@/repositories/email-repo'
import { createTaskFromClassifiedEmail, processEmail } from '@/workflows'
import { POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockFindEmailById = vi.mocked(emailRepo.findEmailById)
const mockSetEmailBucket = vi.mocked(emailRepo.setEmailBucket)
const mockCreateTaskFromClassifiedEmail = vi.mocked(createTaskFromClassifiedEmail)
const mockProcessEmail = vi.mocked(processEmail)

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

describe('POST /api/emails/[id]/extract-task', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
    mockSetEmailBucket.mockResolvedValue({} as never)
    mockCreateTaskFromClassifiedEmail.mockResolvedValue({} as never)
    mockProcessEmail.mockResolvedValue({} as never)
    afterMock.mockImplementation((callback: () => void | Promise<void>) => {
      void callback()
    })
  })

  it('queues pending AI suggestion extraction for action emails', async () => {
    mockFindEmailById.mockResolvedValue(makeEmail() as never)

    const res = await POST(new Request('http://localhost/api/emails/email-1/extract-task', { method: 'POST' }), {
      params: Promise.resolve({ id: 'email-1' }),
    })

    expect(res.status).toBe(200)
    expect(mockSetEmailBucket).not.toHaveBeenCalled()
    expect(mockProcessEmail).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        id: 'email-1',
        taskStatus: 'pending',
        forceAction: true,
      })
    )
  })

  it('allows uncertain emails, marks them tracked, and queues pending extraction', async () => {
    mockFindEmailById.mockResolvedValue(makeEmail({ classification: 'uncertain' }) as never)

    const res = await POST(new Request('http://localhost/api/emails/email-1/extract-task', { method: 'POST' }), {
      params: Promise.resolve({ id: 'email-1' }),
    })

    expect(res.status).toBe(200)
    expect(mockSetEmailBucket).toHaveBeenCalledWith('email-1', 'tracked')
    expect(mockProcessEmail).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        id: 'email-1',
        taskStatus: 'pending',
        forceAction: true,
      })
    )
  })

  it('keeps awaiting review action emails on the pending AI suggestion path', async () => {
    mockFindEmailById.mockResolvedValue(makeEmail({ awaitingReview: true }) as never)

    const res = await POST(new Request('http://localhost/api/emails/email-1/extract-task', { method: 'POST' }), {
      params: Promise.resolve({ id: 'email-1' }),
    })

    expect(res.status).toBe(200)
    expect(mockCreateTaskFromClassifiedEmail).toHaveBeenCalledWith('user-1', 'email-1', 'pending')
    expect(mockProcessEmail).not.toHaveBeenCalled()
  })

  it('rejects FYI and ignored emails', async () => {
    mockFindEmailById.mockResolvedValue(makeEmail({ classification: 'awareness' }) as never)

    const res = await POST(new Request('http://localhost/api/emails/email-1/extract-task', { method: 'POST' }), {
      params: Promise.resolve({ id: 'email-1' }),
    })

    expect(res.status).toBe(400)
    expect(mockProcessEmail).not.toHaveBeenCalled()
  })

  it('returns 409 when an active task is already linked', async () => {
    mockFindEmailById.mockResolvedValue(
      makeEmail({
        taskLinks: [{ task: { id: 'task-1', status: 'pending' } }],
      }) as never
    )

    const res = await POST(new Request('http://localhost/api/emails/email-1/extract-task', { method: 'POST' }), {
      params: Promise.resolve({ id: 'email-1' }),
    })

    expect(res.status).toBe(409)
    expect(mockProcessEmail).not.toHaveBeenCalled()
  })
})
