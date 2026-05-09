import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that reference them
// ---------------------------------------------------------------------------

vi.mock('@/ai', () => ({
  classifyEmail: vi.fn(),
  extractTask: vi.fn(),
  scorePriority: vi.fn(),
  updateThreadMemory: vi.fn(),
  matchMatter: vi.fn(),
}))

vi.mock('@/repositories/email-repo', () => ({
  updateClassification: vi.fn(),
  markClassificationFailed: vi.fn(),
  saveClassificationFields: vi.fn(),
  markActioned: vi.fn(),
}))

vi.mock('@/repositories/task-repo', () => ({
  createTask: vi.fn(),
}))

vi.mock('@/repositories/thread-memory-repo', () => ({
  findByThread: vi.fn(),
  upsert: vi.fn(),
  linkTask: vi.fn(),
  setMatter: vi.fn(),
}))

vi.mock('@/repositories/matter-memory-repo', () => ({
  findById: vi.fn(),
  findCandidates: vi.fn(),
  createFromThread: vi.fn(),
  mergeThread: vi.fn(),
  updateFromThread: vi.fn(),
  setProjectContext: vi.fn(),
  linkPrimaryTask: vi.fn(),
}))

vi.mock('@/repositories/identity-repo', () => ({
  findAllForUser: vi.fn(),
  createSuggestion: vi.fn(),
}))

vi.mock('@/repositories/project-context-repo', () => ({
  findAllForUser: vi.fn(),
  createSuggestion: vi.fn(),
  assignIdentity: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    senderMemory: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    taskEmail: {
      create: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
    },
    email: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import * as ai from '@/ai'
import * as emailRepo from '@/repositories/email-repo'
import * as taskRepo from '@/repositories/task-repo'
import * as threadMemoryRepo from '@/repositories/thread-memory-repo'
import * as matterMemoryRepo from '@/repositories/matter-memory-repo'
import * as identityRepo from '@/repositories/identity-repo'
import * as projectContextRepo from '@/repositories/project-context-repo'
import { prisma } from '@/lib/prisma'
import type { ThreadMemory } from '@/repositories/thread-memory-repo'
import type { MatterMemory } from '@/repositories/matter-memory-repo'
import type { ProjectContext } from '@/repositories/project-context-repo'
import type { UserIdentity } from '@/repositories/identity-repo'

import { createTaskFromClassifiedEmail, processEmail } from '../email-pipeline'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2024-06-01T10:00:00Z')

function makeEmail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'email-1',
    subject: 'Please review the contract by end of week',
    sender: 'boss@acme.com',
    receivedAt: NOW,
    bodyPreview: 'Hi team, please review the contract and provide feedback.',
    bodyFull: 'Hi team, please review the attached contract and provide your feedback by Friday.',
    labels: '["INBOX"]',
    threadId: 'thread-1',
    ...overrides,
  }
}

const MOCK_THREAD_MEMORY: ThreadMemory = {
  id: 'tmem-1', userId: 'user-1', threadId: 'thread-1',
  title: 'Contract Review', topic: 'other', summary: 'Contract needs review',
  status: 'open', nextAction: 'Review contract', matterId: null,
  linkedTaskId: null, lastEmailId: 'email-1', lastMessageAt: NOW,
  emailCount: 1, lastClassification: 'action', participants: ['boss@acme.com'],
  needsFullAnalysis: false, confidence: 0.9, createdAt: NOW, updatedAt: NOW,
}

const MOCK_MATTER: MatterMemory = {
  id: 'matter-1', userId: 'user-1', projectContextId: null,
  title: 'Contract Review', topic: 'other', summary: 'Contract review matter',
  status: 'open', nextAction: null, linkedPrimaryTaskId: null,
  lastEmailId: null, lastMessageAt: null, threadCount: 1, emailCount: 1,
  lastClassification: null, participants: [], keywords: [],
  createdAt: NOW, updatedAt: NOW, projectContext: null,
}

const MOCK_PROJECT: ProjectContext = {
  id: 'proj-1', userId: 'user-1', identityId: null,
  name: 'Contract Review', description: null, status: 'active',
  keywords: [], participants: [], confidence: 0.72,
  createdAt: NOW, updatedAt: NOW, identity: null,
}

const MOCK_IDENTITY: UserIdentity = {
  id: 'identity-1', userId: 'user-1', name: 'Work',
  description: null, status: 'active', keywords: [], hints: [],
  confidence: 0.74, createdAt: NOW, updatedAt: NOW,
}

const MOCK_MATTER_WITH_PROJECT: MatterMemory = {
  ...MOCK_MATTER,
  projectContextId: 'proj-1',
  projectContext: { ...MOCK_PROJECT, identity: MOCK_IDENTITY, identityId: 'identity-1' },
}

// ---------------------------------------------------------------------------
// Default mock implementations (happy path: action email → task created)
// Override in individual tests as needed.
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()

  // AI layer
  vi.mocked(ai.classifyEmail).mockResolvedValue({
    category: 'action', confidence: 0.9,
    reasoning: 'Clear action required', isWorkRelated: true,
  })
  vi.mocked(ai.updateThreadMemory).mockResolvedValue({
    title: 'Contract Review', topic: 'other', summary: 'Review needed',
    status: 'open', nextAction: 'Review contract', needsFullAnalysis: false,
  })
  vi.mocked(ai.matchMatter).mockResolvedValue({ matterId: null, confidence: 0, reasoning: 'No match found' })
  vi.mocked(ai.extractTask).mockResolvedValue({
    tasks: [{
      title: 'Review contract', summary: 'Review the attached contract',
      actionItems: ['Review contract'], explicitDeadline: null,
      inferredDeadline: null, deadlineConfidence: 0, splitReason: null,
    }],
  })
  vi.mocked(ai.scorePriority).mockResolvedValue({
    urgency: 70, impact: 60, combinedScore: 65, reasoning: 'Time-sensitive work task',
  })

  // Email repo
  vi.mocked(emailRepo.updateClassification).mockResolvedValue({} as any)
  vi.mocked(emailRepo.markClassificationFailed).mockResolvedValue({} as any)

  // Task repo
  vi.mocked(taskRepo.createTask).mockResolvedValue({ id: 'task-1', title: 'Review contract' } as any)

  // Thread memory repo
  vi.mocked(threadMemoryRepo.findByThread).mockResolvedValue(null)
  vi.mocked(threadMemoryRepo.upsert).mockResolvedValue(MOCK_THREAD_MEMORY)
  vi.mocked(threadMemoryRepo.linkTask).mockResolvedValue(undefined as any)
  vi.mocked(threadMemoryRepo.setMatter).mockResolvedValue(undefined as any)

  // Matter memory repo
  vi.mocked(matterMemoryRepo.findCandidates).mockResolvedValue([])
  vi.mocked(matterMemoryRepo.createFromThread).mockResolvedValue(MOCK_MATTER)
  vi.mocked(matterMemoryRepo.setProjectContext).mockResolvedValue(MOCK_MATTER_WITH_PROJECT)
  vi.mocked(matterMemoryRepo.linkPrimaryTask).mockResolvedValue({} as any)
  vi.mocked(matterMemoryRepo.findById).mockResolvedValue(null)
  vi.mocked(matterMemoryRepo.updateFromThread).mockResolvedValue(MOCK_MATTER)
  vi.mocked(matterMemoryRepo.mergeThread).mockResolvedValue(MOCK_MATTER)

  // Project / identity repos
  vi.mocked(projectContextRepo.findAllForUser).mockResolvedValue([])
  vi.mocked(projectContextRepo.createSuggestion).mockResolvedValue(MOCK_PROJECT)
  vi.mocked(projectContextRepo.assignIdentity).mockResolvedValue({
    ...MOCK_PROJECT, identityId: 'identity-1', identity: MOCK_IDENTITY,
  })
  vi.mocked(identityRepo.findAllForUser).mockResolvedValue([])
  vi.mocked(identityRepo.createSuggestion).mockResolvedValue(MOCK_IDENTITY)

  // Prisma direct calls
  vi.mocked(prisma.senderMemory.findUnique).mockResolvedValue(null)
  vi.mocked(prisma.senderMemory.create).mockResolvedValue({} as any)
  vi.mocked(prisma.senderMemory.update).mockResolvedValue({} as any)
  vi.mocked(prisma.taskEmail.create).mockResolvedValue({} as any)
  vi.mocked(prisma.task.findMany).mockResolvedValue([])
  vi.mocked(prisma.email.findUnique).mockResolvedValue({
    ...makeEmail(),
    userId: 'user-1',
    awaitingReview: true,
  } as any)
  vi.mocked(prisma.email.update).mockResolvedValue({} as any)
  vi.mocked(prisma.email.updateMany).mockResolvedValue({ count: 1 } as any)

})

// ---------------------------------------------------------------------------
// Tests: pre-filter paths (no AI called)
// ---------------------------------------------------------------------------

describe('processEmail — short body guard', () => {
  it('returns skippedByRule:true and uncertain classification without calling AI', async () => {
    const email = makeEmail({ bodyFull: 'Hi', bodyPreview: 'Hi' })

    const result = await processEmail('user-1', email)

    expect(result.skippedByRule).toBe(true)
    expect(result.classification).toBe('uncertain')
    expect(result.taskCreated).toBe(false)
    expect(ai.classifyEmail).not.toHaveBeenCalled()
  })

  it('calls updateClassification with uncertain for a short body', async () => {
    await processEmail('user-1', makeEmail({ bodyFull: 'Short', bodyPreview: 'Short' }))

    expect(emailRepo.updateClassification).toHaveBeenCalledWith(
      'email-1',
      expect.objectContaining({ category: 'uncertain' })
    )
  })
})

describe('processEmail — provider category pre-filter', () => {
  it('skips AI for emails labelled CATEGORY_PROMOTIONS', async () => {
    const email = makeEmail({ labels: '["INBOX","CATEGORY_PROMOTIONS"]' })

    const result = await processEmail('user-1', email)

    expect(result.skippedByRule).toBe(true)
    expect(result.classification).toBe('ignore')
    expect(ai.classifyEmail).not.toHaveBeenCalled()
  })

  it('skips AI for spam-labelled emails', async () => {
    const email = makeEmail({ labels: '["SPAM"]' })

    const result = await processEmail('user-1', email)

    expect(result.skippedByRule).toBe(true)
    expect(result.classification).toBe('ignore')
  })
})

describe('processEmail — noreply sender pre-filter', () => {
  it('skips AI and returns awareness for noreply sender', async () => {
    const email = makeEmail({ sender: 'noreply@github.com' })

    const result = await processEmail('user-1', email)

    expect(result.skippedByRule).toBe(true)
    expect(result.classification).toBe('awareness')
    expect(ai.classifyEmail).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Tests: classification paths (AI called, different outcomes)
// ---------------------------------------------------------------------------

describe('processEmail — ignore classification', () => {
  it('returns taskCreated:false and skippedByRule:false', async () => {
    vi.mocked(ai.classifyEmail).mockResolvedValue({
      category: 'ignore', confidence: 0.92,
      reasoning: 'Newsletter', isWorkRelated: false,
    })

    const result = await processEmail('user-1', makeEmail())

    expect(result.classification).toBe('ignore')
    expect(result.taskCreated).toBe(false)
    expect(result.skippedByRule).toBe(false)
    expect(ai.classifyEmail).toHaveBeenCalledOnce()
  })

  it('does NOT update thread memory for ignored emails', async () => {
    vi.mocked(ai.classifyEmail).mockResolvedValue({
      category: 'ignore', confidence: 0.9, reasoning: 'Ignore', isWorkRelated: false,
    })

    await processEmail('user-1', makeEmail())

    expect(threadMemoryRepo.upsert).not.toHaveBeenCalled()
  })

  it('does NOT create a task for ignored emails', async () => {
    vi.mocked(ai.classifyEmail).mockResolvedValue({
      category: 'ignore', confidence: 0.9, reasoning: 'Ignore', isWorkRelated: false,
    })

    await processEmail('user-1', makeEmail())

    expect(taskRepo.createTask).not.toHaveBeenCalled()
  })
})

describe('processEmail — awareness classification', () => {
  beforeEach(() => {
    vi.mocked(ai.classifyEmail).mockResolvedValue({
      category: 'awareness', confidence: 0.85,
      reasoning: 'Informational update', isWorkRelated: true,
    })
  })

  it('returns taskCreated:false', async () => {
    const result = await processEmail('user-1', makeEmail())
    expect(result.taskCreated).toBe(false)
    expect(result.classification).toBe('awareness')
  })

  it('updates thread memory when threadId is present', async () => {
    await processEmail('user-1', makeEmail({ threadId: 'thread-1' }))
    expect(threadMemoryRepo.upsert).toHaveBeenCalledOnce()
  })

  it('does not update thread memory when threadId is absent', async () => {
    await processEmail('user-1', makeEmail({ threadId: null }))
    expect(threadMemoryRepo.upsert).not.toHaveBeenCalled()
  })

  it('does NOT create a task for awareness emails', async () => {
    await processEmail('user-1', makeEmail())
    expect(taskRepo.createTask).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Tests: action classification — full pipeline
// ---------------------------------------------------------------------------

describe('processEmail — action classification (full pipeline)', () => {
  it('returns taskCreated:true and the task id', async () => {
    const result = await processEmail('user-1', makeEmail())

    expect(result.taskCreated).toBe(true)
    expect(result.taskId).toBe('task-1')
    expect(result.classification).toBe('action')
    expect(result.skippedByRule).toBe(false)
  })

  it('calls classifyEmail with email data', async () => {
    await processEmail('user-1', makeEmail())

    expect(ai.classifyEmail).toHaveBeenCalledOnce()
    expect(ai.classifyEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Please review the contract by end of week' })
    )
  })

  it('calls extractTask for action emails', async () => {
    await processEmail('user-1', makeEmail())
    expect(ai.extractTask).toHaveBeenCalledOnce()
  })

  it('calls scorePriority for action emails', async () => {
    await processEmail('user-1', makeEmail())
    expect(ai.scorePriority).toHaveBeenCalledOnce()
  })

  it('calls taskRepo.createTask with userId and extraction data', async () => {
    await processEmail('user-1', makeEmail())

    expect(taskRepo.createTask).toHaveBeenCalledOnce()
    expect(taskRepo.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', status: 'pending' })
    )
  })

  it('creates one task per independent extraction candidate', async () => {
    vi.mocked(ai.extractTask).mockResolvedValue({
      tasks: [
        {
          title: 'Review contract',
          summary: 'Review the attached contract',
          actionItems: ['Read contract', 'Send comments'],
          explicitDeadline: null,
          inferredDeadline: null,
          deadlineConfidence: 0,
          splitReason: 'Legal review outcome',
        },
        {
          title: 'Schedule kickoff',
          summary: 'Book a kickoff meeting with the vendor',
          actionItems: ['Find availability', 'Send invite'],
          explicitDeadline: null,
          inferredDeadline: null,
          deadlineConfidence: 0,
          splitReason: 'Meeting scheduling outcome',
        },
      ],
    })
    vi.mocked(taskRepo.createTask)
      .mockResolvedValueOnce({ id: 'task-1', title: 'Review contract' } as any)
      .mockResolvedValueOnce({ id: 'task-2', title: 'Schedule kickoff' } as any)

    const result = await processEmail('user-1', makeEmail())

    expect(taskRepo.createTask).toHaveBeenCalledTimes(2)
    expect(ai.scorePriority).toHaveBeenCalledTimes(2)
    expect(result.taskIds).toEqual(['task-1', 'task-2'])
  })

  it('creates AI suggestion tasks when a manual review email is approved', async () => {
    await createTaskFromClassifiedEmail('user-1', 'email-1')

    expect(prisma.email.updateMany).toHaveBeenCalledWith({
      where: { id: 'email-1', userId: 'user-1', awaitingReview: true },
      data: { awaitingReview: false },
    })
    expect(taskRepo.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' })
    )
  })

  it('links task to thread memory after creation', async () => {
    await processEmail('user-1', makeEmail())
    expect(threadMemoryRepo.linkTask).toHaveBeenCalledWith('user-1', 'thread-1', 'task-1')
  })
})

// ---------------------------------------------------------------------------
// Tests: task deduplication
// ---------------------------------------------------------------------------

describe('processEmail — task deduplication', () => {
  it('does not create a new task when the matter already has a primary task', async () => {
    // Simulate matter already having a linked task
    vi.mocked(matterMemoryRepo.setProjectContext).mockResolvedValue({
      ...MOCK_MATTER_WITH_PROJECT,
      linkedPrimaryTaskId: 'existing-task',
    })
    vi.mocked(matterMemoryRepo.createFromThread).mockResolvedValue({
      ...MOCK_MATTER,
      linkedPrimaryTaskId: 'existing-task',
    })

    const result = await processEmail('user-1', makeEmail())

    expect(result.taskCreated).toBe(false)
    expect(result.taskId).toBe('existing-task')
    expect(taskRepo.createTask).not.toHaveBeenCalled()
  })

  it('does not create a new task when the thread already has a linked task', async () => {
    vi.mocked(threadMemoryRepo.upsert).mockResolvedValue({
      ...MOCK_THREAD_MEMORY,
      linkedTaskId: 'thread-task',
    })

    const result = await processEmail('user-1', makeEmail())

    expect(result.taskCreated).toBe(false)
    expect(result.taskId).toBe('thread-task')
    expect(taskRepo.createTask).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Tests: error handling
// ---------------------------------------------------------------------------

describe('processEmail — error handling', () => {
  it('returns uncertain classification when classifyEmail throws', async () => {
    vi.mocked(ai.classifyEmail).mockRejectedValue(new Error('AI service unavailable'))

    const result = await processEmail('user-1', makeEmail())

    expect(result.classification).toBe('uncertain')
    expect(result.taskCreated).toBe(false)
    expect(result.confidence).toBe(0)
  })

  it('calls markClassificationFailed when classifyEmail throws', async () => {
    vi.mocked(ai.classifyEmail).mockRejectedValue(new Error('timeout'))

    await processEmail('user-1', makeEmail())

    expect(emailRepo.markClassificationFailed).toHaveBeenCalledWith('email-1')
  })

  it('does not re-throw — always returns a result even on failure', async () => {
    vi.mocked(ai.classifyEmail).mockRejectedValue(new Error('unrecoverable'))
    vi.mocked(ai.extractTask).mockRejectedValue(new Error('unrecoverable'))

    await expect(processEmail('user-1', makeEmail())).resolves.toBeDefined()
  })

  it('preserves the saved classification when extractTask throws (no rollback)', async () => {
    // classifyEmail succeeded earlier in the pipeline → updateClassification
    // wrote 'action' to the DB. extractTask then fails. The pipeline must NOT
    // mark the email as failed/uncertain — that would regress an already
    // classified email back to "needs review".
    vi.mocked(ai.extractTask).mockRejectedValue(new Error('extraction failed'))

    const result = await processEmail('user-1', makeEmail())

    expect(result.classification).toBe('action')
    expect(result.taskCreated).toBe(false)
    // markClassificationFailed must not be called when classification has
    // already been persisted.
    expect(emailRepo.markClassificationFailed).not.toHaveBeenCalled()
  })
})
