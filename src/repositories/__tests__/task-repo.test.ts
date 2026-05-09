import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that reference them
// ---------------------------------------------------------------------------

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    taskEmail: {
      create: vi.fn(),
    },
    threadMemory: {
      findMany: vi.fn(),
    },
  },
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { prisma } from '@/lib/prisma'
import {
  createTask,
  findTasksByDateRange,
  findTaskById,
  updateTask,
  deleteTask,
  deleteManyTasks,
} from '../task-repo'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockPrismaTask = vi.mocked(prisma.task)
const mockPrismaTaskEmail = vi.mocked(prisma.taskEmail)
const mockPrismaThreadMemory = vi.mocked(prisma.threadMemory)

const USER_ID = 'user-1'
const TASK_ID = 'task-1'

function makeCreateTaskData(overrides = {}) {
  return {
    userId: USER_ID,
    emailId: 'email-1',
    extraction: {
      title: 'Review contract',
      summary: 'Legal contract needs review',
      actionItems: ['Read document', 'Sign by Friday'],
      explicitDeadline: '2026-06-01',
      inferredDeadline: null,
      deadlineConfidence: 0.9,
      splitReason: null,
    },
    priority: {
      urgency: 8,
      impact: 7,
      combinedScore: 15,
      reasoning: 'High-priority legal matter',
    },
    ...overrides,
  }
}

const CREATED_TASK = {
  id: TASK_ID,
  userId: USER_ID,
  title: 'Review contract',
  status: 'pending',
  priorityScore: 15,
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrismaThreadMemory.findMany.mockResolvedValue([])
})

// ---------------------------------------------------------------------------
// createTask
// ---------------------------------------------------------------------------

describe('createTask', () => {
  it('creates a task and a taskEmail link', async () => {
    mockPrismaTask.create.mockResolvedValue(CREATED_TASK as never)
    mockPrismaTaskEmail.create.mockResolvedValue({} as never)
    const result = await createTask(makeCreateTaskData())
    expect(mockPrismaTask.create).toHaveBeenCalledTimes(1)
    expect(mockPrismaTaskEmail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ taskId: TASK_ID, emailId: 'email-1', relationship: 'source' }),
      })
    )
    expect(result).toEqual(CREATED_TASK)
  })

  it('defaults status to pending when not provided', async () => {
    mockPrismaTask.create.mockResolvedValue(CREATED_TASK as never)
    mockPrismaTaskEmail.create.mockResolvedValue({} as never)
    await createTask(makeCreateTaskData())
    expect(mockPrismaTask.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'pending' }) })
    )
  })

  it('sets status to confirmed when explicitly provided', async () => {
    mockPrismaTask.create.mockResolvedValue({ ...CREATED_TASK, status: 'confirmed' } as never)
    mockPrismaTaskEmail.create.mockResolvedValue({} as never)
    await createTask(makeCreateTaskData({ status: 'confirmed' }))
    expect(mockPrismaTask.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'confirmed' }) })
    )
  })

  it('rethrows errors from prisma', async () => {
    mockPrismaTask.create.mockRejectedValue(new Error('DB error'))
    await expect(createTask(makeCreateTaskData())).rejects.toThrow('DB error')
  })
})

// ---------------------------------------------------------------------------
// findTasksByDateRange
// ---------------------------------------------------------------------------

describe('findTasksByDateRange', () => {
  it('returns tasks from prisma.task.findMany', async () => {
    const tasks = [CREATED_TASK]
    mockPrismaTask.findMany.mockResolvedValue(tasks as never)
    const start = new Date('2026-05-01')
    const end = new Date('2026-05-02')
    const result = await findTasksByDateRange(USER_ID, { start, end })
    expect(result).toEqual(tasks)
  })

  it('filters by userId and createdAt range', async () => {
    mockPrismaTask.findMany.mockResolvedValue([])
    const start = new Date('2026-05-01')
    const end = new Date('2026-05-02')
    await findTasksByDateRange(USER_ID, { start, end })
    expect(mockPrismaTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: USER_ID,
          createdAt: { gte: start, lt: end },
        }),
        orderBy: { priorityScore: 'desc' },
      })
    )
  })
})

// ---------------------------------------------------------------------------
// findTaskById
// ---------------------------------------------------------------------------

describe('findTaskById', () => {
  it('returns null when task does not exist', async () => {
    mockPrismaTask.findFirst.mockResolvedValue(null)
    const result = await findTaskById(USER_ID, TASK_ID)
    expect(result).toBeNull()
  })

  it('returns the task enriched with null matter and project when no matter or thread', async () => {
    const task = {
      ...CREATED_TASK,
      matter: null,
      emailLinks: [],
    }
    mockPrismaTask.findFirst.mockResolvedValue(task as never)
    const result = await findTaskById(USER_ID, TASK_ID)
    expect(result).toMatchObject({ id: TASK_ID, project: null, matter: null })
  })
})

// ---------------------------------------------------------------------------
// updateTask
// ---------------------------------------------------------------------------

describe('updateTask', () => {
  it('calls prisma.task.update with the correct id and data', async () => {
    const updated = { ...CREATED_TASK, status: 'confirmed' }
    mockPrismaTask.update.mockResolvedValue(updated as never)
    const result = await updateTask(TASK_ID, { status: 'confirmed' })
    expect(mockPrismaTask.update).toHaveBeenCalledWith({
      where: { id: TASK_ID },
      data: { status: 'confirmed' },
    })
    expect(result).toEqual(updated)
  })
})

// ---------------------------------------------------------------------------
// deleteTask
// ---------------------------------------------------------------------------

describe('deleteTask', () => {
  it('calls prisma.task.delete with id and userId', async () => {
    mockPrismaTask.delete.mockResolvedValue(CREATED_TASK as never)
    await deleteTask(TASK_ID, USER_ID)
    expect(mockPrismaTask.delete).toHaveBeenCalledWith({
      where: { id: TASK_ID, userId: USER_ID },
    })
  })
})

// ---------------------------------------------------------------------------
// deleteManyTasks
// ---------------------------------------------------------------------------

describe('deleteManyTasks', () => {
  it('deletes multiple tasks by id for the given user', async () => {
    mockPrismaTask.deleteMany.mockResolvedValue({ count: 3 } as never)
    await deleteManyTasks(['t1', 't2', 't3'], USER_ID)
    expect(mockPrismaTask.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['t1', 't2', 't3'] }, userId: USER_ID },
    })
  })
})
