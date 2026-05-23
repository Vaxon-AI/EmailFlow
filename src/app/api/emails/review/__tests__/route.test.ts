import { beforeEach, describe, expect, it, vi } from 'vitest'

const { afterMock } = vi.hoisted(() => ({
  afterMock: vi.fn(),
}))

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: afterMock }
})

vi.mock('@/repositories/email-repo', () => ({
  dismissReviewEmails: vi.fn(),
}))

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

vi.mock('@/workflows', () => ({
  createTaskFromClassifiedEmail: vi.fn(),
}))

import * as emailRepo from '@/repositories/email-repo'
import { getAuthUser } from '@/lib/api-helpers'
import { createTaskFromClassifiedEmail } from '@/workflows'
import { POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockDismissReviewEmails = vi.mocked(emailRepo.dismissReviewEmails)
const mockCreateTaskFromClassifiedEmail = vi.mocked(createTaskFromClassifiedEmail)

function postRequest(body: object): Request {
  return new Request('http://localhost/api/emails/review', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/emails/review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
    mockDismissReviewEmails.mockResolvedValue(undefined as never)
    mockCreateTaskFromClassifiedEmail.mockResolvedValue(undefined as never)
    afterMock.mockImplementation((callback: () => void | Promise<void>) => {
      void callback()
    })
  })

  it('returns 400 when action is missing', async () => {
    const res = await POST(postRequest({ emailIds: ['email-1'] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when emailIds is empty', async () => {
    const res = await POST(postRequest({ action: 'approve', emailIds: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid action', async () => {
    const res = await POST(postRequest({ action: 'delete', emailIds: ['email-1'] }))
    expect(res.status).toBe(400)
  })

  it('dismisses emails on ignore action', async () => {
    const res = await POST(postRequest({ action: 'ignore', emailIds: ['email-1', 'email-2'] }))

    expect(mockDismissReviewEmails).toHaveBeenCalledWith(['email-1', 'email-2'])
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.action).toBe('ignore')
    expect(body.data.count).toBe(2)
  })

  it('triggers task creation for each email on approve action', async () => {
    const res = await POST(postRequest({ action: 'approve', emailIds: ['email-1', 'email-2'] }))

    expect(mockCreateTaskFromClassifiedEmail).toHaveBeenCalledTimes(2)
    expect(mockCreateTaskFromClassifiedEmail).toHaveBeenNthCalledWith(1, 'user-1', 'email-1', 'ai_suggestion')
    expect(mockCreateTaskFromClassifiedEmail).toHaveBeenNthCalledWith(2, 'user-1', 'email-2', 'ai_suggestion')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.action).toBe('approve')
    expect(body.data.count).toBe(2)
  })

  it('does not call dismiss on approve action', async () => {
    await POST(postRequest({ action: 'approve', emailIds: ['email-1'] }))
    expect(mockDismissReviewEmails).not.toHaveBeenCalled()
  })
})
