import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/repositories/email-repo', () => ({
  findEmailById: vi.fn(),
}))

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

vi.mock('@/lib/prisma', () => ({
  prisma: {
    taskEmail: {
      deleteMany: vi.fn(),
    },
  },
}))

import * as emailRepo from '@/repositories/email-repo'
import { getAuthUser } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { DELETE } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockFindEmailById = vi.mocked(emailRepo.findEmailById)
const mockDeleteMany = vi.mocked(prisma.taskEmail.deleteMany)

describe('DELETE /api/emails/[id]/tasks/[taskId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns 404 when email does not exist', async () => {
    mockFindEmailById.mockResolvedValue(null)

    const res = await DELETE(new NextRequest('http://localhost'), {
      params: Promise.resolve({ id: 'missing', taskId: 'task-1' }),
    })

    expect(res.status).toBe(404)
    expect(mockDeleteMany).not.toHaveBeenCalled()
  })

  it('unlinks task from email and returns success', async () => {
    mockFindEmailById.mockResolvedValue({ id: 'email-1' } as never)
    mockDeleteMany.mockResolvedValue({ count: 1 } as never)

    const res = await DELETE(new NextRequest('http://localhost'), {
      params: Promise.resolve({ id: 'email-1', taskId: 'task-1' }),
    })

    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { emailId: 'email-1', taskId: 'task-1' },
    })
    expect(res.status).toBe(200)
    expect((await res.json()).data.message).toContain('unlinked')
  })
})
