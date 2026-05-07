import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

vi.mock('@/lib/prisma', () => ({
  prisma: {
    projectContext: { findFirst: vi.fn() },
    task: { findMany: vi.fn() },
  },
}))

vi.mock('@/ai/skills/suggest-task-dates', () => ({
  suggestTaskDates: vi.fn(),
}))

import { getAuthUser } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { suggestTaskDates } from '@/ai/skills/suggest-task-dates'
import { POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockProjectContext = vi.mocked(prisma.projectContext)
const mockTask = vi.mocked(prisma.task)
const mockSuggestTaskDates = vi.mocked(suggestTaskDates)

function postRequest(body: object): NextRequest {
  return new NextRequest('http://localhost/api/tasks/suggest-dates', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/tasks/suggest-dates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSuggestTaskDates.mockResolvedValue({ startDate: '2026-05-08', dueDate: '2026-05-15', reasoning: 'r' })
  })

  it('returns 402 PRO_REQUIRED for free users', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'user-1', plan: 'free' } as never)

    const res = await POST(postRequest({ title: 'Ship beta' }))

    expect(res.status).toBe(402)
    const body = await res.json()
    expect(body.error.code).toBe('PRO_REQUIRED')
    expect(mockSuggestTaskDates).not.toHaveBeenCalled()
  })

  it('returns 400 when title is missing or blank for pro users', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'user-1', plan: 'pro' } as never)

    expect((await POST(postRequest({}))).status).toBe(400)
    expect((await POST(postRequest({ title: '   ' }))).status).toBe(400)
    expect(mockSuggestTaskDates).not.toHaveBeenCalled()
  })

  it('runs without project context when no projectId provided', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'user-1', plan: 'pro' } as never)

    const res = await POST(postRequest({ title: 'Ship beta', summary: 'asap' }))

    expect(res.status).toBe(200)
    expect(mockProjectContext.findFirst).not.toHaveBeenCalled()
    expect(mockTask.findMany).not.toHaveBeenCalled()
    expect(mockSuggestTaskDates).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Ship beta',
      summary: 'asap',
      recentTasks: [],
      projectName: undefined,
    }))
  })

  it('passes recent same-project tasks as context when projectId belongs to user', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'user-1', plan: 'pro' } as never)
    mockProjectContext.findFirst.mockResolvedValue({ id: 'proj-1', name: 'Alpha' } as never)
    mockTask.findMany.mockResolvedValue([
      {
        title: 'Earlier task',
        startDate: new Date('2026-04-20'),
        userSetDeadline: new Date('2026-04-27'),
        explicitDeadline: null,
        inferredDeadline: null,
      },
    ] as never)

    const res = await POST(postRequest({ title: 'Follow up', projectId: 'proj-1' }))

    expect(res.status).toBe(200)
    expect(mockProjectContext.findFirst).toHaveBeenCalledWith({
      where: { id: 'proj-1', userId: 'user-1' },
      select: { id: true, name: true },
    })
    expect(mockSuggestTaskDates).toHaveBeenCalledWith(expect.objectContaining({
      projectName: 'Alpha',
      recentTasks: [
        { title: 'Earlier task', startDate: '2026-04-20', dueDate: '2026-04-27' },
      ],
    }))
  })

  it('treats foreign projectId as no-context (skipping the task lookup)', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'user-1', plan: 'pro' } as never)
    mockProjectContext.findFirst.mockResolvedValue(null)

    const res = await POST(postRequest({ title: 'Foo', projectId: 'someone-elses-project' }))

    expect(res.status).toBe(200)
    expect(mockTask.findMany).not.toHaveBeenCalled()
    expect(mockSuggestTaskDates).toHaveBeenCalledWith(expect.objectContaining({
      recentTasks: [],
      projectName: undefined,
    }))
  })
})
