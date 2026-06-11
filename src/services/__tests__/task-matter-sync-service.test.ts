import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    taskEmail: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/repositories/thread-memory-repo', () => ({
  upsertManualMatterAssignment: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { upsertManualMatterAssignment } from '@/repositories/thread-memory-repo'
import { syncThreadMattersForTasks } from '@/services/task-matter-sync-service'

const mockTaskEmailFindMany = vi.mocked(prisma.taskEmail.findMany)
const mockUpsert = vi.mocked(upsertManualMatterAssignment)

const baseInput = {
  userId: 'user-1',
  taskIds: ['task-1'],
  matterId: 'matter-1',
  projectName: 'Alpha',
}

describe('syncThreadMattersForTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpsert.mockResolvedValue(undefined)
  })

  it('returns early without querying when taskIds is empty', async () => {
    const result = await syncThreadMattersForTasks({ ...baseInput, taskIds: [] })

    expect(result).toEqual({ affectedThreads: 0 })
    expect(mockTaskEmailFindMany).not.toHaveBeenCalled()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('dedupes emails on the same thread into a single upsert', async () => {
    mockTaskEmailFindMany.mockResolvedValue([
      { email: { threadId: 'thread-1' } },
      { email: { threadId: 'thread-1' } },
    ] as never)

    const result = await syncThreadMattersForTasks(baseInput)

    expect(result).toEqual({ affectedThreads: 1 })
    expect(mockUpsert).toHaveBeenCalledTimes(1)
    expect(mockUpsert).toHaveBeenCalledWith({
      userId: 'user-1',
      threadId: 'thread-1',
      matterId: 'matter-1',
      projectName: 'Alpha',
    })
  })

  it('upserts each distinct thread once', async () => {
    mockTaskEmailFindMany.mockResolvedValue([
      { email: { threadId: 'thread-1' } },
      { email: { threadId: 'thread-2' } },
    ] as never)

    const result = await syncThreadMattersForTasks({ ...baseInput, taskIds: ['task-1', 'task-2'] })

    expect(mockTaskEmailFindMany).toHaveBeenCalledWith({
      where: { taskId: { in: ['task-1', 'task-2'] }, email: { userId: 'user-1' } },
      select: { email: { select: { threadId: true } } },
    })
    expect(result).toEqual({ affectedThreads: 2 })
    expect(mockUpsert).toHaveBeenCalledTimes(2)
  })

  it('filters out emails without a threadId', async () => {
    mockTaskEmailFindMany.mockResolvedValue([
      { email: { threadId: null } },
      { email: { threadId: 'thread-1' } },
    ] as never)

    const result = await syncThreadMattersForTasks(baseInput)

    expect(result).toEqual({ affectedThreads: 1 })
    expect(mockUpsert).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the task has no linked emails', async () => {
    mockTaskEmailFindMany.mockResolvedValue([] as never)

    const result = await syncThreadMattersForTasks(baseInput)

    expect(result).toEqual({ affectedThreads: 0 })
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})
