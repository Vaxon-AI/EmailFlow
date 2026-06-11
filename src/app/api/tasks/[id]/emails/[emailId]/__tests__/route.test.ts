import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/repositories/task-repo', () => ({
  findTaskById: vi.fn(),
  linkEmailToTask: vi.fn(),
  unlinkTaskFromEmail: vi.fn(),
}))

vi.mock('@/repositories/email-repo', () => ({
  bulkMarkActioned: vi.fn(),
  existsForUser: vi.fn(),
}))

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

vi.mock('@/services/task-matter-sync-service', () => ({
  syncThreadMattersForTasks: vi.fn(),
}))

import * as taskRepo from '@/repositories/task-repo'
import * as emailRepo from '@/repositories/email-repo'
import { getAuthUser } from '@/lib/api-helpers'
import { syncThreadMattersForTasks } from '@/services/task-matter-sync-service'
import { DELETE, POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockFindTaskById = vi.mocked(taskRepo.findTaskById)
const mockBulkMarkActioned = vi.mocked(emailRepo.bulkMarkActioned)
const mockExistsForUser = vi.mocked(emailRepo.existsForUser)
const mockLinkEmailToTask = vi.mocked(taskRepo.linkEmailToTask)
const mockUnlinkTaskFromEmail = vi.mocked(taskRepo.unlinkTaskFromEmail)
const mockSyncThreadMatters = vi.mocked(syncThreadMattersForTasks)

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
    expect(mockUnlinkTaskFromEmail).not.toHaveBeenCalled()
  })

  it('unlinks email from task and returns success', async () => {
    mockFindTaskById.mockResolvedValue({ id: 'task-1' } as never)
    mockUnlinkTaskFromEmail.mockResolvedValue({ count: 1 } as never)

    const res = await DELETE(new NextRequest('http://localhost'), {
      params: Promise.resolve({ id: 'task-1', emailId: 'email-1' }),
    })

    expect(mockUnlinkTaskFromEmail).toHaveBeenCalledWith('email-1', 'task-1')
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
    expect(mockExistsForUser).not.toHaveBeenCalled()
    expect(mockLinkEmailToTask).not.toHaveBeenCalled()
  })

  it('returns 404 when the email is not owned by the current user', async () => {
    mockFindTaskById.mockResolvedValue({ id: 'task-1' } as never)
    mockExistsForUser.mockResolvedValue(false)

    const res = await POST(new NextRequest('http://localhost'), {
      params: Promise.resolve({ id: 'task-1', emailId: 'email-foreign' }),
    })

    expect(mockExistsForUser).toHaveBeenCalledWith('user-1', 'email-foreign')
    expect(res.status).toBe(404)
    expect(mockLinkEmailToTask).not.toHaveBeenCalled()
  })

  it('links an owned email using skipDuplicates so repeated links are harmless', async () => {
    mockFindTaskById.mockResolvedValue({ id: 'task-1' } as never)
    mockExistsForUser.mockResolvedValue(true)
    mockLinkEmailToTask.mockResolvedValue({ count: 1 } as never)

    const res = await POST(new NextRequest('http://localhost'), {
      params: Promise.resolve({ id: 'task-1', emailId: 'email-1' }),
    })

    expect(mockLinkEmailToTask).toHaveBeenCalledWith('task-1', 'email-1')
    expect(mockBulkMarkActioned).toHaveBeenCalledWith('user-1', ['email-1'])
    expect(res.status).toBe(200)
    expect((await res.json()).data.message).toContain('linked')
  })

  it('syncs the linked email thread when the task has an explicit matter', async () => {
    mockFindTaskById.mockResolvedValue({
      id: 'task-1',
      matterId: 'matter-1',
      project: { id: 'proj-1', name: 'Alpha' },
      matter: { id: 'matter-1', title: 'Alpha matter' },
    } as never)
    mockExistsForUser.mockResolvedValue(true)
    mockLinkEmailToTask.mockResolvedValue({ count: 1 } as never)
    mockSyncThreadMatters.mockResolvedValue({ affectedThreads: 1 })

    const res = await POST(new NextRequest('http://localhost'), {
      params: Promise.resolve({ id: 'task-1', emailId: 'email-1' }),
    })

    expect(mockSyncThreadMatters).toHaveBeenCalledWith({
      userId: 'user-1',
      taskIds: ['task-1'],
      matterId: 'matter-1',
      projectName: 'Alpha',
    })
    expect(res.status).toBe(200)
  })

  it('does not sync when the task has no explicit matterId, even with an enriched project', async () => {
    mockFindTaskById.mockResolvedValue({
      id: 'task-1',
      matterId: null,
      project: { id: 'proj-1', name: 'Alpha' },
      matter: { id: 'matter-1', title: 'Alpha matter' },
    } as never)
    mockExistsForUser.mockResolvedValue(true)
    mockLinkEmailToTask.mockResolvedValue({ count: 1 } as never)

    const res = await POST(new NextRequest('http://localhost'), {
      params: Promise.resolve({ id: 'task-1', emailId: 'email-1' }),
    })

    expect(mockSyncThreadMatters).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })
})
