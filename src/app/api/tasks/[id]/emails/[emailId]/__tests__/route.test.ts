import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/repositories/task-repo', () => ({
  findTaskById: vi.fn(),
}))

vi.mock('@/repositories/email-repo', () => ({
  bulkMarkActioned: vi.fn(),
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
    email: {
      findFirst: vi.fn(),
    },
    taskEmail: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

import * as taskRepo from '@/repositories/task-repo'
import * as emailRepo from '@/repositories/email-repo'
import { getAuthUser } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { DELETE, POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockFindTaskById = vi.mocked(taskRepo.findTaskById)
const mockBulkMarkActioned = vi.mocked(emailRepo.bulkMarkActioned)
const mockEmailFindFirst = vi.mocked(prisma.email.findFirst)
const mockCreateMany = vi.mocked(prisma.taskEmail.createMany)
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

describe('POST /api/tasks/[id]/emails/[emailId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns 404 when task does not exist', async () => {
    mockFindTaskById.mockResolvedValue(null)

    const res = await POST(new NextRequest('http://localhost'), {
      params: Promise.resolve({ id: 'missing', emailId: 'email-1' }),
    })

    expect(res.status).toBe(404)
    expect(mockEmailFindFirst).not.toHaveBeenCalled()
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it('returns 404 when the email is not owned by the current user', async () => {
    mockFindTaskById.mockResolvedValue({ id: 'task-1' } as never)
    mockEmailFindFirst.mockResolvedValue(null)

    const res = await POST(new NextRequest('http://localhost'), {
      params: Promise.resolve({ id: 'task-1', emailId: 'email-foreign' }),
    })

    expect(mockEmailFindFirst).toHaveBeenCalledWith({
      where: { id: 'email-foreign', userId: 'user-1' },
      select: { id: true },
    })
    expect(res.status).toBe(404)
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it('links an owned email using skipDuplicates so repeated links are harmless', async () => {
    mockFindTaskById.mockResolvedValue({ id: 'task-1' } as never)
    mockEmailFindFirst.mockResolvedValue({ id: 'email-1' } as never)
    mockCreateMany.mockResolvedValue({ count: 1 } as never)

    const res = await POST(new NextRequest('http://localhost'), {
      params: Promise.resolve({ id: 'task-1', emailId: 'email-1' }),
    })

    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [{ taskId: 'task-1', emailId: 'email-1', relationship: 'source' }],
      skipDuplicates: true,
    })
    expect(mockBulkMarkActioned).toHaveBeenCalledWith('user-1', ['email-1'])
    expect(res.status).toBe(200)
    expect((await res.json()).data.message).toContain('linked')
  })
})
