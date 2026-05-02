import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/repositories/task-repo', () => ({
  findTaskById: vi.fn(),
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

import * as taskRepo from '@/repositories/task-repo'
import { getAuthUser } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { DELETE } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockFindTaskById = vi.mocked(taskRepo.findTaskById)
const mockDeleteMany = vi.mocked(prisma.taskEmail.deleteMany)

describe('DELETE /api/tasks/[id]/emails/[emailId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns 404 when task does not exist', async () => {
    mockFindTaskById.mockResolvedValue(null)

    const res = await DELETE(new NextRequest('http://localhost'), {
      params: Promise.resolve({ id: 'missing', emailId: 'email-1' }),
    })

    expect(res.status).toBe(404)
    expect(mockDeleteMany).not.toHaveBeenCalled()
  })

  it('unlinks email from task and returns success', async () => {
    mockFindTaskById.mockResolvedValue({ id: 'task-1' } as never)
    mockDeleteMany.mockResolvedValue({ count: 1 } as never)

    const res = await DELETE(new NextRequest('http://localhost'), {
      params: Promise.resolve({ id: 'task-1', emailId: 'email-1' }),
    })

    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { taskId: 'task-1', emailId: 'email-1' },
    })
    expect(res.status).toBe(200)
    expect((await res.json()).data.message).toContain('unlinked')
  })
})
