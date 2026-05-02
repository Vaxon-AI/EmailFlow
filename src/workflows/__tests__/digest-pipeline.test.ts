import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that reference them
// ---------------------------------------------------------------------------

vi.mock('@/repositories/email-repo', () => ({
  findEmailsByClassification: vi.fn(),
}))

vi.mock('@/repositories/task-repo', () => ({
  findTasksByDateRange: vi.fn(),
}))

vi.mock('@/repositories/digest-repo', () => ({
  createDigest: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import * as emailRepo from '@/repositories/email-repo'
import * as taskRepo from '@/repositories/task-repo'
import * as digestRepo from '@/repositories/digest-repo'
import { prisma } from '@/lib/prisma'
import { createDailyDigest, createWeeklyDigest } from '../digest-pipeline'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'user-abc'

function makeEmail(subject: string, sender = 'sender@example.com') {
  return { subject, sender }
}

function makeTask(title: string, status: 'confirmed' | 'pending', priorityScore: number | null = null) {
  return { title, status, priorityScore, userSetDeadline: null, explicitDeadline: null, inferredDeadline: null }
}

const mockEmailRepo = vi.mocked(emailRepo)
const mockTaskRepo = vi.mocked(taskRepo)
const mockDigestRepo = vi.mocked(digestRepo)
const mockUser = vi.mocked(prisma.user)

beforeEach(() => {
  vi.clearAllMocks()
  mockEmailRepo.findEmailsByClassification.mockResolvedValue([])
  mockTaskRepo.findTasksByDateRange.mockResolvedValue([])
  mockDigestRepo.createDigest.mockResolvedValue({ id: 'digest-1' } as never)
  mockUser.findUnique.mockResolvedValue({ timezone: 'UTC' } as never)
})

// ---------------------------------------------------------------------------
// createDailyDigest
// ---------------------------------------------------------------------------

describe('createDailyDigest', () => {
  it('calls createDigest with period = daily', async () => {
    await createDailyDigest(USER_ID)
    expect(mockDigestRepo.createDigest).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, period: 'daily' })
    )
  })

  it('produces "No activity yet today." when there are no emails', async () => {
    await createDailyDigest(USER_ID)
    const [call] = mockDigestRepo.createDigest.mock.calls
    expect(call[0].content).toContain('No activity yet today.')
  })

  it('includes action section header when action emails exist', async () => {
    mockEmailRepo.findEmailsByClassification.mockImplementation(async (_, category) => {
      if (category === 'action') return [makeEmail('Invoice overdue', 'billing@co.com')]
      return []
    })
    await createDailyDigest(USER_ID)
    const content = mockDigestRepo.createDigest.mock.calls[0][0].content
    expect(content).toContain('### Needs Action (1)')
    expect(content).toContain('Invoice overdue')
  })

  it('includes awareness section header when awareness emails exist', async () => {
    mockEmailRepo.findEmailsByClassification.mockImplementation(async (_, category) => {
      if (category === 'awareness') return [makeEmail('Team update')]
      return []
    })
    await createDailyDigest(USER_ID)
    const content = mockDigestRepo.createDigest.mock.calls[0][0].content
    expect(content).toContain('### FYI (1)')
  })

  it('includes uncertain section header when uncertain emails exist', async () => {
    mockEmailRepo.findEmailsByClassification.mockImplementation(async (_, category) => {
      if (category === 'uncertain') return [makeEmail('Ambiguous subject')]
      return []
    })
    await createDailyDigest(USER_ID)
    const content = mockDigestRepo.createDigest.mock.calls[0][0].content
    expect(content).toContain('### Uncertain (1)')
  })

  it('shows confirmed and pending task counts in the header line', async () => {
    mockTaskRepo.findTasksByDateRange.mockResolvedValue([
      makeTask('Write report', 'confirmed', 15) as never,
      makeTask('Review PR', 'confirmed', 8) as never,
      makeTask('AI suggestion', 'pending') as never,
    ])
    await createDailyDigest(USER_ID)
    const content = mockDigestRepo.createDigest.mock.calls[0][0].content
    expect(content).toContain('2 active · 1 AI suggestions')
  })

  it('sorts confirmed tasks by priorityScore descending', async () => {
    mockTaskRepo.findTasksByDateRange.mockResolvedValue([
      makeTask('Low priority', 'confirmed', 3) as never,
      makeTask('High priority', 'confirmed', 18) as never,
    ])
    await createDailyDigest(USER_ID)
    const content = mockDigestRepo.createDigest.mock.calls[0][0].content
    const highIdx = content.indexOf('High priority')
    const lowIdx = content.indexOf('Low priority')
    expect(highIdx).toBeLessThan(lowIdx)
  })

  it('shows "No tasks in the pipeline." when there are no tasks', async () => {
    await createDailyDigest(USER_ID)
    const content = mockDigestRepo.createDigest.mock.calls[0][0].content
    expect(content).toContain('No tasks in the pipeline.')
  })

  it('passes correct stats to createDigest', async () => {
    mockEmailRepo.findEmailsByClassification.mockImplementation(async (_, category) => {
      if (category === 'action') return [makeEmail('A'), makeEmail('B')]
      if (category === 'awareness') return [makeEmail('C')]
      return []
    })
    mockTaskRepo.findTasksByDateRange.mockResolvedValue([
      makeTask('T1', 'confirmed') as never,
      makeTask('T2', 'pending') as never,
    ])
    await createDailyDigest(USER_ID)
    const stats = mockDigestRepo.createDigest.mock.calls[0][0].stats
    expect(stats).toMatchObject({
      actionCount: 2,
      awarenessCount: 1,
      unresolvedCount: 0,
      ignoredCount: 0,
      taskTotal: 2,
      taskPending: 1,
    })
  })

  it('shows task deadline in content when userSetDeadline is provided', async () => {
    const deadline = new Date('2026-06-15')
    mockTaskRepo.findTasksByDateRange.mockResolvedValue([
      { ...makeTask('Deadline task', 'confirmed', 10), userSetDeadline: deadline } as never,
    ])
    await createDailyDigest(USER_ID)
    const content = mockDigestRepo.createDigest.mock.calls[0][0].content
    expect(content).toContain('Jun')
  })
})

// ---------------------------------------------------------------------------
// createWeeklyDigest
// ---------------------------------------------------------------------------

describe('createWeeklyDigest', () => {
  it('calls createDigest with period = weekly', async () => {
    await createWeeklyDigest(USER_ID)
    expect(mockDigestRepo.createDigest).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, period: 'weekly' })
    )
  })

  it('includes "Weekly Digest" header in content', async () => {
    await createWeeklyDigest(USER_ID)
    const content = mockDigestRepo.createDigest.mock.calls[0][0].content
    expect(content).toContain('## Weekly Digest')
  })

  it('includes the summary section', async () => {
    await createWeeklyDigest(USER_ID)
    const content = mockDigestRepo.createDigest.mock.calls[0][0].content
    expect(content).toContain('### Summary')
  })

  it('creates with isPreview = true', async () => {
    await createWeeklyDigest(USER_ID)
    expect(mockDigestRepo.createDigest).toHaveBeenCalledWith(
      expect.objectContaining({ isPreview: true })
    )
  })

  it('shows action email count in summary', async () => {
    mockEmailRepo.findEmailsByClassification.mockImplementation(async (_, category) => {
      if (category === 'action') return [makeEmail('Urgent task')]
      return []
    })
    await createWeeklyDigest(USER_ID)
    const content = mockDigestRepo.createDigest.mock.calls[0][0].content
    expect(content).toContain('needs action')
  })
})
