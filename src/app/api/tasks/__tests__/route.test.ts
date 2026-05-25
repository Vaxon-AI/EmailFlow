import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/repositories/task-repo', () => ({
  findTasksPaginated: vi.fn(),
}))

vi.mock('@/repositories/stats-repo', () => ({
  invalidateStatsCache: vi.fn(),
}))

vi.mock('@/services/manual-task-service', () => ({
  createManualTask: vi.fn(),
}))

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

import * as taskRepo from '@/repositories/task-repo'
import { invalidateStatsCache } from '@/repositories/stats-repo'
import { getAuthUser } from '@/lib/api-helpers'
import { createManualTask } from '@/services/manual-task-service'
import { GET, POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockFindTasksPaginated = vi.mocked(taskRepo.findTasksPaginated)
const mockCreateManualTask = vi.mocked(createManualTask)
const mockInvalidateStatsCache = vi.mocked(invalidateStatsCache)

describe('GET /api/tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('passes parsed filters to the repository and returns pagination meta', async () => {
    mockFindTasksPaginated.mockResolvedValue({
      tasks: [{ id: 'task-1', title: 'Task 1' }],
      total: 21,
    } as never)

    const req = new NextRequest('http://localhost/api/tasks?page=2&limit=10&status=active&scope=open&priority=high&sort=deadline')
    const res = await GET(req)

    expect(mockFindTasksPaginated).toHaveBeenCalledWith('user-1', {
      page: 2,
      limit: 10,
      status: 'active',
      scope: 'open',
      priority: 'high',
      sort: 'deadline',
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      success: true,
      data: [{ id: 'task-1', title: 'Task 1' }],
      meta: {
        page: 2,
        totalPages: 3,
        totalCount: 21,
      },
    })
  })

  it('ignores unsupported priority and scope values', async () => {
    mockFindTasksPaginated.mockResolvedValue({
      tasks: [],
      total: 0,
    } as never)

    const req = new NextRequest('http://localhost/api/tasks?scope=closed&priority=urgent')
    await GET(req)

    expect(mockFindTasksPaginated).toHaveBeenCalledWith('user-1', {
      page: 1,
      limit: 50,
      status: undefined,
      scope: undefined,
      priority: undefined,
      sort: 'priority',
    })
  })
})

describe('POST /api/tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns 400 when title is missing', async () => {
    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    })

    const res = await POST(req)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Title is required',
      },
    })
    expect(mockCreateManualTask).not.toHaveBeenCalled()
  })

  it('returns 400 for malformed JSON', async () => {
    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: '{',
      headers: { 'content-type': 'application/json' },
    })

    const res = await POST(req)

    expect(res.status).toBe(400)
    expect(mockCreateManualTask).not.toHaveBeenCalled()
  })

  it('returns 400 when the request body is not an object', async () => {
    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify('bad-body'),
      headers: { 'content-type': 'application/json' },
    })

    const res = await POST(req)

    expect(res.status).toBe(400)
    expect(mockCreateManualTask).not.toHaveBeenCalled()
  })

  it('delegates manual task creation with the normalized payload', async () => {
    const deadline = '2026-05-01T10:00:00.000Z'
    mockCreateManualTask.mockResolvedValue({ id: 'task-1', title: 'Follow up' } as never)

    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Follow up',
        projectId: 'project-1',
        summary: 'Call the client',
        actionItems: '["call"]',
        userSetDeadline: deadline,
        urgency: 4,
        impact: 5,
        priorityScore: 20,
        source: 'manual',
      }),
      headers: { 'content-type': 'application/json' },
    })

    const res = await POST(req)

    expect(mockCreateManualTask).toHaveBeenCalledWith({
      userId: 'user-1',
      title: 'Follow up',
      summary: 'Call the client',
      actionItems: '["call"]',
      userSetDeadline: deadline,
      startDate: undefined,
      urgency: 4,
      impact: 5,
      priorityScore: 20,
      projectId: 'project-1',
      source: 'manual',
      emailIds: [],
      markLinkedEmailsActioned: true,
      emptyActionItemsValue: '[]',
    })
    expect(mockInvalidateStatsCache).toHaveBeenCalledWith('user-1')
    expect(res.status).toBe(200)
  })

  it('passes through standalone tasks without project-specific branching', async () => {
    mockCreateManualTask.mockResolvedValue({ id: 'task-1', title: 'Inbox zero' } as never)

    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Inbox zero', projectId: 'project-404' }),
      headers: { 'content-type': 'application/json' },
    })

    await POST(req)

    expect(mockCreateManualTask).toHaveBeenCalledWith({
      userId: 'user-1',
      title: 'Inbox zero',
      summary: undefined,
      actionItems: undefined,
      userSetDeadline: undefined,
      startDate: undefined,
      urgency: undefined,
      impact: undefined,
      priorityScore: undefined,
      projectId: 'project-404',
      source: 'manual',
      emailIds: [],
      markLinkedEmailsActioned: true,
      emptyActionItemsValue: '[]',
    })
  })

  it('writes startDate when provided', async () => {
    mockCreateManualTask.mockResolvedValue({ id: 'task-1', title: 'With start' } as never)

    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'With start', startDate: '2026-05-10' }),
      headers: { 'content-type': 'application/json' },
    })

    await POST(req)

    expect(mockCreateManualTask).toHaveBeenCalledWith(expect.objectContaining({
      startDate: '2026-05-10',
    }))
  })

  it('keeps copy_text AI extraction tasks pending for review', async () => {
    mockCreateManualTask.mockResolvedValue({ id: 'task-1', title: 'Drafted by AI' } as never)

    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Drafted by AI', source: 'copy_text' }),
      headers: { 'content-type': 'application/json' },
    })

    await POST(req)

    expect(mockCreateManualTask).toHaveBeenCalledWith(expect.objectContaining({
      source: 'copy_text',
    }))
  })

  it('links provided emailIds to the new task, scoped to the user', async () => {
    mockCreateManualTask.mockResolvedValue({ id: 'task-1', title: 'Coordinate' } as never)

    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Coordinate',
        emailIds: ['email-1', 'email-2', 'email-foreign'],
      }),
      headers: { 'content-type': 'application/json' },
    })

    const res = await POST(req)

    expect(mockCreateManualTask).toHaveBeenCalledWith(expect.objectContaining({
      emailIds: ['email-1', 'email-2', 'email-foreign'],
      markLinkedEmailsActioned: true,
    }))
    expect(res.status).toBe(200)
  })

  it('normalizes non-array emailIds to an empty array', async () => {
    mockCreateManualTask.mockResolvedValue({ id: 'task-1', title: 'Plain' } as never)

    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Plain', emailIds: 'email-1' }),
      headers: { 'content-type': 'application/json' },
    })

    await POST(req)

    expect(mockCreateManualTask).toHaveBeenCalledWith(expect.objectContaining({
      emailIds: [],
    }))
  })

  it('skips email linking when emailIds is empty or omitted', async () => {
    mockCreateManualTask.mockResolvedValue({ id: 'task-1', title: 'Plain' } as never)

    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Plain', emailIds: [] }),
      headers: { 'content-type': 'application/json' },
    })

    await POST(req)

    expect(mockCreateManualTask).toHaveBeenCalledWith(expect.objectContaining({
      emailIds: [],
    }))
  })
})
