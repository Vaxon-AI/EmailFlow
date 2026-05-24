import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
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

vi.mock('@/repositories/email-repo', () => ({
  bulkMarkActioned: vi.fn(),
}))

vi.mock('@/services/project-matter-service', () => ({
  ensureMatterForProject: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { bulkMarkActioned } from '@/repositories/email-repo'
import { ensureMatterForProject } from '@/services/project-matter-service'
import { createManualTask } from '@/services/manual-task-service'

const mockTask = vi.mocked(prisma.task)
const mockEmail = vi.mocked(prisma.email)
const mockTaskEmail = vi.mocked(prisma.taskEmail)
const mockBulkMarkActioned = vi.mocked(bulkMarkActioned)
const mockEnsureMatterForProject = vi.mocked(ensureMatterForProject)

describe('createManualTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTask.create.mockResolvedValue({ id: 'task-1', title: 'Task' } as never)
  })

  it('creates a standalone manual task with default values', async () => {
    await createManualTask({
      userId: 'user-1',
      title: 'Task',
      source: 'manual',
      emptyActionItemsValue: '[]',
    })

    expect(mockTask.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        title: 'Task',
        summary: '',
        status: 'active',
        activeAt: expect.any(Date),
        urgency: 3,
        impact: 3,
        priorityScore: 9,
        actionItems: '[]',
        userSetDeadline: undefined,
        startDate: undefined,
        source: 'manual',
        matterId: undefined,
      },
    })
  })

  it('uses ensured matter id and links owned emails', async () => {
    mockEnsureMatterForProject.mockResolvedValue({ id: 'matter-1', projectName: 'Alpha' } as never)
    mockEmail.findMany.mockResolvedValue([{ id: 'email-1' }, { id: 'email-2' }] as never)
    mockTaskEmail.createMany.mockResolvedValue({ count: 2 } as never)
    mockBulkMarkActioned.mockResolvedValue({ count: 2 } as never)

    await createManualTask({
      userId: 'user-1',
      title: 'Task',
      projectId: 'project-1',
      emailIds: ['email-1', 'email-2'],
      markLinkedEmailsActioned: true,
      source: 'copy_text',
    })

    expect(mockEnsureMatterForProject).toHaveBeenCalledWith('user-1', 'project-1')
    expect(mockTask.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'ai_suggestion',
        activeAt: null,
        matterId: 'matter-1',
      }),
    }))
    expect(mockTaskEmail.createMany).toHaveBeenCalledWith({
      data: [
        { taskId: 'task-1', emailId: 'email-1', relationship: 'source' },
        { taskId: 'task-1', emailId: 'email-2', relationship: 'source' },
      ],
      skipDuplicates: true,
    })
    expect(mockBulkMarkActioned).toHaveBeenCalledWith('user-1', ['email-1', 'email-2'])
  })
})
