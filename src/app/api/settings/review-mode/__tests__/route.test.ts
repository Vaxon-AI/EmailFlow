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

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      update: vi.fn(),
    },
    email: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/workflows', () => ({
  createTaskFromClassifiedEmail: vi.fn(),
}))

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/api-helpers'
import { createTaskFromClassifiedEmail } from '@/workflows'
import { POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockUser = vi.mocked(prisma.user)
const mockEmail = vi.mocked(prisma.email)
const mockCreateTask = vi.mocked(createTaskFromClassifiedEmail)

function postRequest(body: object): Request {
  return new Request('http://localhost/api/settings/review-mode', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/settings/review-mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
    afterMock.mockImplementation((callback: () => void | Promise<void>) => {
      void callback()
    })
  })

  it('returns 400 for invalid payload', async () => {
    const res = await POST(postRequest({ manualReviewMode: 'true' }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'manualReviewMode must be a boolean',
      },
    })
    expect(mockUser.update).not.toHaveBeenCalled()
  })

  it('updates review mode without scheduling background work when enabling manual review', async () => {
    const res = await POST(postRequest({ manualReviewMode: true }))

    expect(res.status).toBe(200)
    expect(mockUser.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { manualReviewMode: true },
    })
    expect(afterMock).not.toHaveBeenCalled()
    expect(mockEmail.findMany).not.toHaveBeenCalled()
  })

  it('schedules task creation for pending emails when disabling manual review', async () => {
    mockEmail.findMany.mockResolvedValue([{ id: 'email-1' }, { id: 'email-2' }] as never)
    mockCreateTask.mockResolvedValue(undefined as never)

    const res = await POST(postRequest({ manualReviewMode: false }))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(res.status).toBe(200)
    expect(mockEmail.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', awaitingReview: true },
      select: { id: true },
    })
    expect(afterMock).toHaveBeenCalledTimes(1)
    expect(mockCreateTask).toHaveBeenCalledTimes(2)
    expect(mockCreateTask).toHaveBeenNthCalledWith(1, 'user-1', 'email-1', 'pending')
    expect(mockCreateTask).toHaveBeenNthCalledWith(2, 'user-1', 'email-2', 'pending')
  })
})
