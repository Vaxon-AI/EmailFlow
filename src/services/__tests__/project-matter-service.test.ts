import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    projectContext: {
      findFirst: vi.fn(),
    },
    matterMemory: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { ensureMatterForProject } from '@/services/project-matter-service'

const mockProjectContext = vi.mocked(prisma.projectContext)
const mockMatterMemory = vi.mocked(prisma.matterMemory)

describe('ensureMatterForProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when the project does not belong to the user', async () => {
    mockProjectContext.findFirst.mockResolvedValue(null)

    await expect(ensureMatterForProject('user-1', 'project-1')).resolves.toBeNull()
    expect(mockMatterMemory.findFirst).not.toHaveBeenCalled()
  })

  it('reuses an existing matter for the project', async () => {
    mockProjectContext.findFirst.mockResolvedValue({ id: 'project-1', name: 'Alpha' } as never)
    mockMatterMemory.findFirst.mockResolvedValue({ id: 'matter-1' } as never)

    await expect(ensureMatterForProject('user-1', 'project-1')).resolves.toEqual({
      id: 'matter-1',
      projectName: 'Alpha',
    })
    expect(mockMatterMemory.create).not.toHaveBeenCalled()
  })

  it('creates a new matter when none exists yet', async () => {
    mockProjectContext.findFirst.mockResolvedValue({ id: 'project-1', name: 'Alpha' } as never)
    mockMatterMemory.findFirst.mockResolvedValue(null)
    mockMatterMemory.create.mockResolvedValue({ id: 'matter-new' } as never)

    await expect(ensureMatterForProject('user-1', 'project-1')).resolves.toEqual({
      id: 'matter-new',
      projectName: 'Alpha',
    })
    expect(mockMatterMemory.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        projectContextId: 'project-1',
        title: 'Alpha',
        summary: 'Manually assigned to this project',
        status: 'open',
        topic: 'other',
      },
      select: { id: true },
    })
  })
})

