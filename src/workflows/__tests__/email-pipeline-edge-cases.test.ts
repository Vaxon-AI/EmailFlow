import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Regression / invariant tests for email-pipeline.ts edge cases.
//
// Invariants protected here (not covered in email-pipeline.test.ts):
//   1. Malformed labels JSON → pipeline continues (AI still called)
//   2. Empty '[]' labels → no provider-category skip, AI still called
//   3. action + threadId=null → task created, but linkTask/linkPrimaryTask NOT called
//   4. AI returns unknown category → taskCreated:false, no crash
//   5. null bodyFull + adequate bodyPreview → classified with preview (no crash)
//   6. Empty/null sender → pipeline completes without crash
//   7. null/empty subject → AI still called, no crash
//   8. AI extractTask returns partial/malformed fields → pipeline doesn't crash
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mocks
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
    userPreference: {
      findUnique: vi.fn(),
    },
    taskEmail: {
      create: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
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
import { processEmail } from '../email-pipeline'

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
// Default happy-path setup: action email → task created
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()

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
  vi.mocked(emailRepo.updateClassification).mockResolvedValue({} as any)
  vi.mocked(emailRepo.markClassificationFailed).mockResolvedValue({} as any)
  vi.mocked(taskRepo.createTask).mockResolvedValue({ id: 'task-1', title: 'Review contract' } as any)
  vi.mocked(threadMemoryRepo.findByThread).mockResolvedValue(null)
  vi.mocked(threadMemoryRepo.upsert).mockResolvedValue(MOCK_THREAD_MEMORY)
  vi.mocked(threadMemoryRepo.linkTask).mockResolvedValue(undefined as any)
  vi.mocked(threadMemoryRepo.setMatter).mockResolvedValue(undefined as any)
  vi.mocked(matterMemoryRepo.findCandidates).mockResolvedValue([])
  vi.mocked(matterMemoryRepo.createFromThread).mockResolvedValue(MOCK_MATTER)
  vi.mocked(matterMemoryRepo.setProjectContext).mockResolvedValue(MOCK_MATTER_WITH_PROJECT)
  vi.mocked(matterMemoryRepo.linkPrimaryTask).mockResolvedValue({} as any)
  vi.mocked(matterMemoryRepo.findById).mockResolvedValue(null)
  vi.mocked(matterMemoryRepo.updateFromThread).mockResolvedValue(MOCK_MATTER)
  vi.mocked(matterMemoryRepo.mergeThread).mockResolvedValue(MOCK_MATTER)
  vi.mocked(projectContextRepo.findAllForUser).mockResolvedValue([])
  vi.mocked(projectContextRepo.createSuggestion).mockResolvedValue(MOCK_PROJECT)
  vi.mocked(projectContextRepo.assignIdentity).mockResolvedValue({
    ...MOCK_PROJECT, identityId: 'identity-1', identity: MOCK_IDENTITY,
  })
  vi.mocked(identityRepo.findAllForUser).mockResolvedValue([])
  vi.mocked(identityRepo.createSuggestion).mockResolvedValue(MOCK_IDENTITY)
  vi.mocked(prisma.senderMemory.findUnique).mockResolvedValue(null)
  vi.mocked(prisma.senderMemory.create).mockResolvedValue({} as any)
  vi.mocked(prisma.senderMemory.update).mockResolvedValue({} as any)
  vi.mocked(prisma.userPreference.findUnique).mockResolvedValue(null)
  vi.mocked(prisma.taskEmail.create).mockResolvedValue({} as any)
  vi.mocked(prisma.task.findMany).mockResolvedValue([])
})

// ---------------------------------------------------------------------------
// Labels parsing
// ---------------------------------------------------------------------------

describe('processEmail — malformed labels JSON', () => {
  it('still calls classifyEmail when labels is invalid JSON (fallback to [])', async () => {
    // The pipeline must not crash on bad JSON — stepPreFilter catches the parse error
    const email = makeEmail({ labels: 'NOT_VALID_JSON' })

    const result = await processEmail('user-1', email)

    // No provider-category skip triggered → AI was called
    expect(ai.classifyEmail).toHaveBeenCalledOnce()
    // Pipeline returned a real result (not uncertain from crash)
    expect(result.classification).toBe('action')
  })

  it('does NOT set skippedByRule for an email with malformed labels', async () => {
    const result = await processEmail('user-1', makeEmail({ labels: '{bad json' }))
    expect(result.skippedByRule).toBe(false)
  })
})

describe('processEmail — empty labels array', () => {
  it('calls classifyEmail when labels is empty JSON array', async () => {
    const result = await processEmail('user-1', makeEmail({ labels: '[]' }))

    expect(ai.classifyEmail).toHaveBeenCalledOnce()
    expect(result.skippedByRule).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Action email with threadId = null
//
// This is the highest-risk regression: a colleague may assume linkTask is
// always called after task creation, but that is only true when threadId is
// set.  These tests enforce the contract explicitly.
// ---------------------------------------------------------------------------

describe('processEmail — action email with threadId=null', () => {
  it('still creates a task even without a threadId', async () => {
    const result = await processEmail('user-1', makeEmail({ threadId: null }))

    expect(result.taskCreated).toBe(true)
    expect(result.taskId).toBeDefined()
    expect(taskRepo.createTask).toHaveBeenCalledOnce()
  })

  it('does NOT call threadMemoryRepo.linkTask when threadId is null', async () => {
    await processEmail('user-1', makeEmail({ threadId: null }))
    expect(threadMemoryRepo.linkTask).not.toHaveBeenCalled()
  })

  it('does NOT call threadMemoryRepo.upsert when threadId is null', async () => {
    await processEmail('user-1', makeEmail({ threadId: null }))
    expect(threadMemoryRepo.upsert).not.toHaveBeenCalled()
  })

  it('does NOT call matterMemoryRepo.createFromThread when threadId is null', async () => {
    // Matter matching requires thread memory — skipped entirely when no threadId
    await processEmail('user-1', makeEmail({ threadId: null }))
    expect(matterMemoryRepo.createFromThread).not.toHaveBeenCalled()
  })

  it('still calls extractTask and scorePriority', async () => {
    await processEmail('user-1', makeEmail({ threadId: null }))
    expect(ai.extractTask).toHaveBeenCalledOnce()
    expect(ai.scorePriority).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// AI returns an unknown category
//
// The AI contract says it returns 'action' | 'awareness' | 'ignore', but
// network issues or model drift could produce anything.  The pipeline must
// treat unknowns as non-action (no task) and must not crash.
// ---------------------------------------------------------------------------

describe('processEmail — AI returns unknown category', () => {
  it('returns taskCreated:false for an unknown category string', async () => {
    vi.mocked(ai.classifyEmail).mockResolvedValue({
      category: 'newsletter' as any, confidence: 0.8,
      reasoning: 'Unexpected value', isWorkRelated: false,
    })

    const result = await processEmail('user-1', makeEmail())

    expect(result.taskCreated).toBe(false)
    expect(taskRepo.createTask).not.toHaveBeenCalled()
  })

  it('does not throw for an unknown category string', async () => {
    vi.mocked(ai.classifyEmail).mockResolvedValue({
      category: 'urgent' as any, confidence: 0.9,
      reasoning: 'Unknown value', isWorkRelated: true,
    })

    await expect(processEmail('user-1', makeEmail())).resolves.toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// null bodyFull — must use bodyPreview for classification
// ---------------------------------------------------------------------------

describe('processEmail — null bodyFull', () => {
  it('classifies using bodyPreview when bodyFull is null', async () => {
    const email = makeEmail({ bodyFull: null })

    const result = await processEmail('user-1', email)

    expect(ai.classifyEmail).toHaveBeenCalledOnce()
    expect(result.classification).toBe('action')
  })

  it('returns skippedByRule:true when both bodyFull and bodyPreview are short', async () => {
    const email = makeEmail({ bodyFull: null, bodyPreview: 'Hi' })

    const result = await processEmail('user-1', email)

    expect(result.skippedByRule).toBe(true)
    expect(result.classification).toBe('uncertain')
    expect(ai.classifyEmail).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Empty sender
// ---------------------------------------------------------------------------

describe('processEmail — empty or missing sender', () => {
  it('completes without crash when sender is an empty string', async () => {
    const email = makeEmail({ sender: '' })

    await expect(processEmail('user-1', email)).resolves.toBeDefined()
  })

  it('still calls classifyEmail when sender is empty', async () => {
    await processEmail('user-1', makeEmail({ sender: '' }))
    expect(ai.classifyEmail).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// ignore invariant: task NEVER created regardless of sender/subject content
// ---------------------------------------------------------------------------

describe('processEmail — ignore invariant', () => {
  it('never creates a task for an ignore-classified email regardless of content', async () => {
    vi.mocked(ai.classifyEmail).mockResolvedValue({
      category: 'ignore', confidence: 0.99, reasoning: 'Junk', isWorkRelated: false,
    })

    const emailWithActionKeywords = makeEmail({
      subject: 'URGENT: Sign contract NOW, deadline tomorrow!',
      bodyFull: 'Please sign the attached contract immediately. Deadline: tomorrow 9am.',
    })

    const result = await processEmail('user-1', emailWithActionKeywords)

    expect(result.taskCreated).toBe(false)
    expect(taskRepo.createTask).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// awareness invariant: task NEVER created
// ---------------------------------------------------------------------------

describe('processEmail — awareness invariant', () => {
  it('never creates a task for an awareness-classified email regardless of content', async () => {
    vi.mocked(ai.classifyEmail).mockResolvedValue({
      category: 'awareness', confidence: 0.95, reasoning: 'Info only', isWorkRelated: true,
    })

    const result = await processEmail('user-1', makeEmail())

    expect(result.taskCreated).toBe(false)
    expect(taskRepo.createTask).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// null / empty subject
//
// The subject field is optional in some Gmail messages.  The pipeline must
// not crash and must still call classifyEmail — the body alone may be enough
// to classify the email.
// ---------------------------------------------------------------------------

describe('processEmail — null or empty subject', () => {
  it('completes without crash when subject is null', async () => {
    await expect(processEmail('user-1', makeEmail({ subject: null as any }))).resolves.toBeDefined()
  })

  it('still calls classifyEmail when subject is null', async () => {
    await processEmail('user-1', makeEmail({ subject: null as any }))
    expect(ai.classifyEmail).toHaveBeenCalledOnce()
  })

  it('completes without crash when subject is an empty string', async () => {
    await expect(processEmail('user-1', makeEmail({ subject: '' }))).resolves.toBeDefined()
  })

  it('still calls classifyEmail when subject is empty string', async () => {
    await processEmail('user-1', makeEmail({ subject: '' }))
    expect(ai.classifyEmail).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// AI extractTask returns partial / malformed fields
//
// If extractTask returns missing or null fields the pipeline must not crash.
// The outer try/catch must absorb any downstream TypeError and return a
// defined result. Crucially, when classification has already been saved,
// the catch must NOT call markClassificationFailed — that would regress
// an already-classified email back to "uncertain — Classification failed".
// ---------------------------------------------------------------------------

describe('processEmail — extractTask returns partial fields', () => {
  it('does not throw when extractTask returns an empty title', async () => {
    vi.mocked(ai.extractTask).mockResolvedValue({
      tasks: [{
        title: '', summary: '', actionItems: [],
        explicitDeadline: null, inferredDeadline: null, deadlineConfidence: null as any, splitReason: null,
      }],
    })

    await expect(processEmail('user-1', makeEmail())).resolves.toBeDefined()
  })

  it('returns a defined result (not undefined) when extractTask returns empty fields', async () => {
    vi.mocked(ai.extractTask).mockResolvedValue({
      tasks: [{
        title: '', summary: '', actionItems: [],
        explicitDeadline: null, inferredDeadline: null, deadlineConfidence: null as any, splitReason: null,
      }],
    })

    const result = await processEmail('user-1', makeEmail())
    expect(result).toBeDefined()
    expect(result.emailId).toBe('email-1')
  })

  it('does NOT call markClassificationFailed when extractTask crashes (classification already saved)', async () => {
    // Simulate malformed AI output that causes a TypeError in downstream steps
    vi.mocked(ai.extractTask).mockResolvedValue(null as any)

    await processEmail('user-1', makeEmail())

    // classifyEmail succeeded and updateClassification was called — the saved
    // classification must NOT be rolled back by the post-classify catch path.
    expect(emailRepo.markClassificationFailed).not.toHaveBeenCalled()
  })

  it('returns a defined result when extractTask returns null', async () => {
    vi.mocked(ai.extractTask).mockResolvedValue(null as any)

    const result = await processEmail('user-1', makeEmail())

    // The post-classify catch returns a placeholder result, but the DB still
    // holds the real classification (preserved by the early `await emailRepo.updateClassification`).
    expect(result).toBeDefined()
    expect(result.taskCreated).toBe(false)
  })
})
