import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/repositories/task-repo', () => ({
  findTasksPaginated: vi.fn(),
}))

vi.mock('@/repositories/stats-repo', () => ({
  invalidateStatsCache: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    projectContext: {
      findFirst: vi.fn(),
    },
    matterMemory: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    task: {
      create: vi.fn(),
    },
    email: {
      findMany: vi.fn(),
    },
    taskEmail: {
      createMany: vi.fn(),
    },
  },
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
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/api-helpers'
import { GET, POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockFindTasksPaginated = vi.mocked(taskRepo.findTasksPaginated)
const mockInvalidateStatsCache = vi.mocked(invalidateStatsCache)
const mockProjectContext = vi.mocked(prisma.projectContext)
const mockMatterMemory = vi.mocked(prisma.matterMemory)
const mockTask = vi.mocked(prisma.task)
const mockEmail = vi.mocked(prisma.email)
const mockTaskEmail = vi.mocked(prisma.taskEmail)

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

    const req = new NextRequest('http://localhost/api/tasks?page=2&limit=10&status=done&scope=open&priority=high&sort=deadline')
    const res = await GET(req)

    expect(mockFindTasksPaginated).toHaveBeenCalledWith('user-1', {
      page: 2,
      limit: 10,
      status: 'done',
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
    expect(mockTask.create).not.toHaveBeenCalled()
  })

  it('creates a linked matter for a valid project before creating the task', async () => {
    const deadline = '2026-05-01T10:00:00.000Z'
    mockProjectContext.findFirst.mockResolvedValue({ id: 'project-1', name: 'Matter A' } as never)
    mockMatterMemory.findFirst.mockResolvedValue(null)
    mockMatterMemory.create.mockResolvedValue({ id: 'matter-1' } as never)
    mockTask.create.mockResolvedValue({ id: 'task-1', title: 'Follow up' } as never)

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

    expect(mockProjectContext.findFirst).toHaveBeenCalledWith({
      where: { id: 'project-1', userId: 'user-1' },
    })
    expect(mockMatterMemory.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        projectContextId: 'project-1',
        title: 'Matter A',
        summary: 'Manually assigned to this project',
        status: 'open',
        topic: 'other',
      },
    })
    expect(mockTask.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        title: 'Follow up',
        summary: 'Call the client',
        status: 'pending',
        urgency: 4,
        impact: 5,
        priorityScore: 20,
        actionItems: '["call"]',
        userSetDeadline: new Date(deadline),
        source: 'manual',
        matterId: 'matter-1',
      },
    })
    expect(mockInvalidateStatsCache).toHaveBeenCalledWith('user-1')
    expect(res.status).toBe(200)
  })

  it('creates a standalone task when the project does not belong to the user', async () => {
    mockProjectContext.findFirst.mockResolvedValue(null)
    mockTask.create.mockResolvedValue({ id: 'task-1', title: 'Inbox zero' } as never)

    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Inbox zero', projectId: 'project-404' }),
      headers: { 'content-type': 'application/json' },
    })

    await POST(req)

    expect(mockMatterMemory.findFirst).not.toHaveBeenCalled()
    expect(mockMatterMemory.create).not.toHaveBeenCalled()
    expect(mockTask.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        title: 'Inbox zero',
        summary: '',
        status: 'pending',
        urgency: 3,
        impact: 3,
        priorityScore: 9,
        actionItems: '[]',
        userSetDeadline: undefined,
        source: 'manual',
        matterId: undefined,
      },
    })
  })

  it('links provided emailIds to the new task, scoped to the user', async () => {
    mockTask.create.mockResolvedValue({ id: 'task-1', title: 'Coordinate' } as never)
    mockEmail.findMany.mockResolvedValue([
      { id: 'email-1' },
      { id: 'email-2' },
    ] as never)
    mockTaskEmail.createMany.mockResolvedValue({ count: 2 } as never)

    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Coordinate',
        emailIds: ['email-1', 'email-2', 'email-foreign'],
      }),
      headers: { 'content-type': 'application/json' },
    })

    const res = await POST(req)

    expect(mockEmail.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['email-1', 'email-2', 'email-foreign'] }, userId: 'user-1' },
      select: { id: true },
    })
    expect(mockTaskEmail.createMany).toHaveBeenCalledWith({
      data: [
        { taskId: 'task-1', emailId: 'email-1', relationship: 'source' },
        { taskId: 'task-1', emailId: 'email-2', relationship: 'source' },
      ],
      skipDuplicates: true,
    })
    expect(res.status).toBe(200)
  })

  it('skips email linking when emailIds is empty or omitted', async () => {
    mockTask.create.mockResolvedValue({ id: 'task-1', title: 'Plain' } as never)

    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Plain', emailIds: [] }),
      headers: { 'content-type': 'application/json' },
    })

    await POST(req)

    expect(mockEmail.findMany).not.toHaveBeenCalled()
    expect(mockTaskEmail.createMany).not.toHaveBeenCalled()
  })
})
