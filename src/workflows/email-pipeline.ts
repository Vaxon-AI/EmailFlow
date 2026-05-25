import { classifyEmail, extractTask, scorePriority, updateThreadMemory, matchMatter } from '@/ai'
import * as Sentry from '@sentry/nextjs'
import { preFilterEmail, prepareForClassification, prepareForExtraction } from '@/ai/utils'
import * as emailRepo from '@/repositories/email-repo'
import * as taskRepo from '@/repositories/task-repo'
import * as threadMemoryRepo from '@/repositories/thread-memory-repo'
import * as matterMemoryRepo from '@/repositories/matter-memory-repo'
import * as identityRepo from '@/repositories/identity-repo'
import * as projectContextRepo from '@/repositories/project-context-repo'
import * as senderMemoryRepo from '@/repositories/sender-memory-repo'
import type { ThreadMemory } from '@/repositories/thread-memory-repo'
import type { MatterMemory } from '@/repositories/matter-memory-repo'
import type { UserIdentity } from '@/repositories/identity-repo'
import type { ProjectContext } from '@/repositories/project-context-repo'
import type { TaskCandidate } from '@/ai'
import { prisma } from '@/lib/prisma'

// ============================================================
// Email Pipeline — processes a single email through the full AI pipeline
//
// Memory layers (v2):
//   Thread layer  — one record per Gmail threadId
//   Matter layer  — one record per underlying situation/project,
//                   may span multiple threads
//
// Processing order for each new email:
//   Pre-filter → Classify → Update thread memory →
//   Match/create matter → Task dedup (matter > thread) →
//   Extract → Score → Create task → Link to thread + matter
// ============================================================

// Confidence threshold for accepting an AI matter match.
// Below this value we always create a new matter.
const MATTER_MATCH_THRESHOLD = 0.85
const PROJECT_REVIEW_THRESHOLD = 0.9
const IDENTITY_REVIEW_THRESHOLD = 0.9

export interface ReviewSuggestion {
  id: string
  name: string
  isNew: boolean
  confidence: number
  reason?: string
}

export interface PipelineReviewCandidate {
  emailId: string
  taskId?: string
  matterId?: string
  matterTitle: string
  project: ReviewSuggestion | null
  identity: ReviewSuggestion | null
}

export interface PipelineResult {
  emailId: string
  classification: string
  confidence: number
  taskCreated: boolean
  taskId?: string
  taskIds?: string[]
  createdTaskIds?: string[]
  dedupedTaskIds?: string[]
  noCandidates?: boolean
  skippedByRule: boolean
  reviewCandidate?: PipelineReviewCandidate
}

type ProcessEmailInput = {
  id: string
  subject: string
  sender: string
  receivedAt: Date
  bodyPreview: string
  bodyFull: string | null
  labels: string
  threadId?: string | null
  awaitingReview?: boolean
  taskStatus?: 'ai_suggestion' | 'active'
  forceAction?: boolean
}

type SavedClassificationState = {
  saved: boolean
  category: string | null
  confidence: number
}

type ClassificationStageResult = {
  classification: {
    category: string
    confidence: number
    reasoning: string
    isWorkRelated: boolean
  }
  shouldReturn: boolean
  result?: PipelineResult
}

function saveClassificationState(state: SavedClassificationState, classification: PipelineResult | {
  category: string
  confidence: number
}) {
  state.saved = true
  state.category = classification.category
  state.confidence = classification.confidence
}

function buildNoTaskResult(
  emailId: string,
  classification: string,
  confidence: number,
  extra: Partial<PipelineResult> = {},
): PipelineResult {
  return {
    emailId,
    classification,
    confidence,
    taskCreated: false,
    skippedByRule: false,
    ...extra,
  }
}

function buildDedupedTaskResult(
  emailId: string,
  classification: string,
  confidence: number,
  taskId: string,
  reviewCandidate?: PipelineReviewCandidate,
): PipelineResult {
  return buildNoTaskResult(emailId, classification, confidence, {
    taskId,
    taskIds: [taskId],
    createdTaskIds: [],
    dedupedTaskIds: [taskId],
    reviewCandidate,
  })
}

async function persistClassificationStage(args: {
  email: ProcessEmailInput
  classification: {
    category: string
    confidence: number
    reasoning: string
    isWorkRelated: boolean
  }
  savedClassification: SavedClassificationState
}): Promise<ClassificationStageResult> {
  const { email, classification, savedClassification } = args

  if (email.awaitingReview) {
    if (classification.category === 'action') {
      await emailRepo.saveClassificationFields(email.id, classification)
      saveClassificationState(savedClassification, classification)
      return {
        classification,
        shouldReturn: true,
        result: buildNoTaskResult(email.id, classification.category, classification.confidence),
      }
    }

    // Non-action: clear awaitingReview so thread memory and sender memory are updated
    await emailRepo.clearAwaitingReview(email.id)
  }

  await emailRepo.updateClassification(email.id, classification)
  saveClassificationState(savedClassification, classification)

  return {
    classification,
    shouldReturn: false,
  }
}

// ── Step 0: Rule-based pre-filter ────────────────────────────

function stepPreFilter(email: { sender: string; subject: string; labels: string }) {
  let labelArray: string[] = []
  try {
    labelArray = JSON.parse(email.labels || '[]')
  } catch {
    labelArray = []
  }

  const categoryMap: Record<string, 'spam' | 'promotions' | 'social' | 'updates'> = {
    SPAM: 'spam',
    CATEGORY_PROMOTIONS: 'promotions',
    CATEGORY_SOCIAL: 'social',
    CATEGORY_UPDATES: 'updates',
    CATEGORY_FORUMS: 'social',
  }

  const providerCategories = labelArray
    .map((l) => categoryMap[l])
    .filter((c): c is 'spam' | 'promotions' | 'social' | 'updates' => !!c)

  return preFilterEmail({
    sender: email.sender,
    subject: email.subject,
    providerCategories,
  })
}

export async function processEmailRuleOnly(email: ProcessEmailInput): Promise<PipelineResult | null> {
  if (email.forceAction) return null

  const rawBodyForCheck = email.bodyFull || email.bodyPreview
  if (rawBodyForCheck.trim().length < 10) {
    await emailRepo.updateClassification(email.id, {
      category: 'uncertain',
      confidence: 0,
      reasoning: 'Email body too short to classify',
      isWorkRelated: false,
    })
    return {
      emailId: email.id,
      classification: 'uncertain',
      confidence: 0,
      taskCreated: false,
      skippedByRule: true,
    }
  }

  const preFilter = stepPreFilter(email)
  if (!preFilter.skipped) return null

  await emailRepo.updateClassification(email.id, {
    category: preFilter.category!,
    confidence: preFilter.confidence!,
    reasoning: preFilter.reasoning!,
    isWorkRelated: preFilter.isWorkRelated!,
  })

  return {
    emailId: email.id,
    classification: preFilter.category!,
    confidence: preFilter.confidence!,
    taskCreated: false,
    skippedByRule: true,
  }
}

// ── Memory context builder ────────────────────────────────────

/**
 * Builds the memory prefix injected into AI prompts.
 * Priority: matter context > thread context > sender behavior > global rules.
 */
async function buildMemoryContext(
  userId: string,
  sender: string,
  threadMemory: ThreadMemory | null,
  matterMemory: MatterMemory | null
): Promise<string> {
  const lines: string[] = [
    '- Prefer short actionable summaries.',
    '- Emails about deadlines, meetings, interviews, university, work, bills, payments, verification, approvals, and submissions should be treated as more important.',
    '- Promotional, newsletter, discount, sale, and generic marketing emails are usually low value unless they contain a clear required action.',
  ]

  // User profile from onboarding (Personalisation Setup) — stable user picture,
  // weight relevance toward declared roles/uses/focus areas.
  const userPref = await prisma.userPreference.findUnique({ where: { userId } })
  if (userPref) {
    const roles = Array.isArray(userPref.roles) ? (userPref.roles as unknown[]).filter((v): v is string => typeof v === 'string') : []
    const purposes = Array.isArray(userPref.purposes) ? (userPref.purposes as unknown[]).filter((v): v is string => typeof v === 'string') : []
    const focus = Array.isArray(userPref.focusAreas) ? (userPref.focusAreas as unknown[]).filter((v): v is string => typeof v === 'string') : []
    if (roles.length || purposes.length || focus.length) {
      lines.push('')
      lines.push('User profile (use to weight relevance, not as hard rules):')
      if (roles.length) lines.push(`- Roles: ${roles.join(', ')}`)
      if (purposes.length) lines.push(`- Primary uses: ${purposes.join(', ')}`)
      if (focus.length) lines.push(`- Focus areas: ${focus.join(', ')}`)
    }
  }

  // Learned sender behavior
  const senderMemory = await senderMemoryRepo.findByUserAndSender(userId, sender)

  if (senderMemory) {
    const total = senderMemory.actionCount + senderMemory.awarenessCount + senderMemory.ignoreCount
    if (total >= 3) {
      if (senderMemory.ignoreCount / total > 0.7) {
        lines.push('- User usually ignores emails from this sender.')
      }
      if (senderMemory.actionCount / total > 0.6) {
        lines.push('- User usually treats emails from this sender as requiring action.')
      }
    }
  }

  // Matter-level context (highest value — spans multiple threads)
  if (matterMemory) {
    lines.push('')
    lines.push('Matter context (the broader situation this email belongs to):')
    lines.push(`- Matter: ${matterMemory.title}`)
    lines.push(`- Topic: ${matterMemory.topic}`)
    lines.push(`- Overall summary: ${matterMemory.summary}`)
    lines.push(`- Status: ${matterMemory.status}`)
    if (matterMemory.nextAction) {
      lines.push(`- Matter-level next action: ${matterMemory.nextAction}`)
    }
    if (matterMemory.threadCount > 1) {
      lines.push(`- This matter spans ${matterMemory.threadCount} email thread(s).`)
    }
    if (matterMemory.projectContext) {
      lines.push(`- Project: ${matterMemory.projectContext.name}`)
      if (matterMemory.projectContext.identity) {
        lines.push(`- Identity: ${matterMemory.projectContext.identity.name}`)
      }
    }
  } else if (threadMemory) {
    // Fall back to thread context when matter not yet known
    lines.push('')
    lines.push('Thread context (prior emails in this conversation):')
    lines.push(`- Matter: ${threadMemory.title}`)
    lines.push(`- Topic: ${threadMemory.topic}`)
    lines.push(`- Current summary: ${threadMemory.summary}`)
    lines.push(`- Status: ${threadMemory.status}`)
    if (threadMemory.nextAction) {
      lines.push(`- Previously identified next action: ${threadMemory.nextAction}`)
    }
    if (threadMemory.emailCount > 1) {
      lines.push(`- This thread has ${threadMemory.emailCount} prior email(s).`)
    }
  }

  lines.push('')
  lines.push('Use these as soft guidance — base the final decision on the actual email content.')
  lines.push('')

  return lines.join('\n')
}

type AssignmentResult = {
  matter: MatterMemory
  project: ProjectContext | null
  projectIsNew: boolean
  projectReason?: string
  identity: UserIdentity | null
  identityIsNew: boolean
  identityReason?: string
}

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractSignalKeywords(...values: string[]): string[] {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'your', 'about', 'this', 'that', 'have'])

  return [...new Set(
    values
      .flatMap((value) => normalizeLabel(value).split(' '))
      .map((part) => part.trim())
      .filter((part) => part.length >= 3 && !stopWords.has(part))
  )]
}

function scoreOverlap(haystack: string[], needles: string[]): number {
  if (haystack.length === 0 || needles.length === 0) return 0
  const hay = new Set(haystack.map(normalizeLabel))
  const matches = needles.filter((needle) => hay.has(normalizeLabel(needle))).length
  return matches / Math.max(needles.length, 1)
}

function inferIdentityName(input: { sender: string; matter: MatterMemory }): string {
  const sender = input.sender.toLowerCase()
  const text = `${input.matter.title} ${input.matter.summary} ${input.matter.topic}`.toLowerCase()

  if (/\b(course|class|semester|professor|assignment|campus|university|lecture|thesis|supervisor)\b/.test(text)) {
    return 'Student'
  }

  if (/\b(startup|product|launch|roadmap|fundraising|founder|investor|mvp)\b/.test(text)) {
    return 'Founder'
  }

  if (/\b(family|rent|medical|doctor|house|home|insurance)\b/.test(text)) {
    return 'Life Admin'
  }

  if (sender.includes('.edu')) {
    return 'Student'
  }

  return 'Work'
}

async function stepAssignProjectAndIdentity(
  userId: string,
  email: { sender: string },
  matter: MatterMemory
): Promise<AssignmentResult> {
  let currentMatter = matter
  let project = matter.projectContext
  let projectIsNew = false
  let projectReason: string | undefined
  let identity = project?.identity ?? null
  let identityIsNew = false
  let identityReason: string | undefined

  const matterKeywords = extractSignalKeywords(matter.title, matter.summary, matter.topic, ...matter.keywords)

  if (!project) {
    const allProjects = await projectContextRepo.findAllForUser(userId)
    const bestProject = allProjects
      .map((candidate) => {
        const nameScore = normalizeLabel(candidate.name) === normalizeLabel(matter.title) ? 1 : 0
        const keywordScore = scoreOverlap(candidate.keywords, matterKeywords)
        const participantScore = scoreOverlap(candidate.participants, matter.participants)
        const score = nameScore * 0.6 + keywordScore * 0.25 + participantScore * 0.15
        return { candidate, score }
      })
      .sort((a, b) => b.score - a.score)[0]

    if (bestProject && bestProject.score >= 0.78) {
      currentMatter = await matterMemoryRepo.setProjectContext(matter.id, bestProject.candidate.id)
      project = bestProject.candidate
      identity = bestProject.candidate.identity
      projectReason = `Matched existing project by title, keyword, and participant overlap (${Math.round(bestProject.score * 100)}%).`
    } else {
      project = await projectContextRepo.createSuggestion(userId, {
        name: matter.title,
        description: matter.summary,
        keywords: matterKeywords,
        participants: matter.participants,
        confidence: bestProject ? Math.max(0.62, bestProject.score) : 0.72,
      })
      currentMatter = await matterMemoryRepo.setProjectContext(matter.id, project.id)
      projectIsNew = true
      projectReason = bestProject
        ? `Suggested a new project because the best existing match only reached ${Math.round(bestProject.score * 100)}% overlap.`
        : 'Suggested a new project because no similar existing project was found.'
    }
  }

  if (project && !identity) {
    const allIdentities = await identityRepo.findAllForUser(userId)
    const inferredName = inferIdentityName({ sender: email.sender, matter: currentMatter })
    const matchingIdentity = allIdentities.find((candidate) => normalizeLabel(candidate.name) === normalizeLabel(inferredName))

    if (matchingIdentity) {
      identity = matchingIdentity
      project = await projectContextRepo.assignIdentity(project.id, matchingIdentity.id)
      identityReason = `Matched existing identity from sender and matter language: ${inferredName}.`
    } else {
      identity = await identityRepo.createSuggestion(userId, {
        name: inferredName,
        description: `Suggested from matter "${currentMatter.title}"`,
        keywords: matterKeywords,
        hints: [email.sender],
        confidence: 0.74,
      })
      project = await projectContextRepo.assignIdentity(project.id, identity.id)
      identityIsNew = true
      identityReason = `Suggested a new identity from sender and matter language: ${inferredName}.`
    }
  }

  return {
    matter: currentMatter,
    project,
    projectIsNew,
    projectReason,
    identity,
    identityIsNew,
    identityReason,
  }
}

function buildReviewCandidate(
  emailId: string,
  matter: MatterMemory,
  assignment: AssignmentResult,
  taskId?: string
): PipelineReviewCandidate | undefined {
  const shouldReview =
    assignment.projectIsNew ||
    assignment.identityIsNew ||
    (assignment.project?.confidence ?? 1) < PROJECT_REVIEW_THRESHOLD ||
    (assignment.identity?.confidence ?? 1) < IDENTITY_REVIEW_THRESHOLD

  if (!shouldReview) return undefined

  return {
    emailId,
    taskId,
    matterId: matter.id,
    matterTitle: matter.title,
    project: assignment.project
      ? {
          id: assignment.project.id,
          name: assignment.project.name,
          isNew: assignment.projectIsNew,
          confidence: assignment.project.confidence,
          reason: assignment.projectReason,
        }
      : null,
    identity: assignment.identity
      ? {
          id: assignment.identity.id,
          name: assignment.identity.name,
          isNew: assignment.identityIsNew,
          confidence: assignment.identity.confidence,
          reason: assignment.identityReason,
        }
      : null,
  }
}

const CLASSIFY_TIMEOUT_MS = 10_000

// ── Step 1: Classify ─────────────────────────────────────────

async function stepClassify(
  email: {
    id: string
    subject: string
    sender: string
    receivedAt: Date
    bodyPreview: string
    bodyFull: string | null
  },
  memoryContext: string
) {
  const rawBody = email.bodyFull || email.bodyPreview
  const cleanedBody = prepareForClassification(rawBody)

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('classifyEmail timeout')), CLASSIFY_TIMEOUT_MS)
  )

  const result = await Promise.race([
    classifyEmail({
      subject: email.subject,
      sender: email.sender,
      date: email.receivedAt.toISOString(),
      bodyPreview: cleanedBody,
      memory: memoryContext,
    }),
    timeout,
  ])

  // DB save is handled by the caller so it can choose the appropriate save method
  // (full updateClassification vs saveClassificationFields for review mode)
  return result
}

// ── Step 2: Update thread memory ─────────────────────────────

async function stepUpdateThreadMemory(
  userId: string,
  email: {
    id: string
    subject: string
    sender: string
    receivedAt: Date
    bodyPreview: string
    bodyFull: string | null
  },
  threadId: string,
  existingMemory: ThreadMemory | null,
  classification: string
): Promise<ThreadMemory> {
  const updated = await updateThreadMemory({
    subject: email.subject,
    sender: email.sender,
    date: email.receivedAt.toISOString(),
    bodyPreview: email.bodyFull ?? email.bodyPreview,
    classification,
    existingMemory: existingMemory
      ? {
          title: existingMemory.title,
          topic: existingMemory.topic,
          summary: existingMemory.summary,
          status: existingMemory.status,
          nextAction: existingMemory.nextAction,
        }
      : null,
  })

  return threadMemoryRepo.upsert(userId, threadId, {
    title: updated.title,
    topic: updated.topic,
    summary: updated.summary,
    status: updated.status,
    nextAction: updated.nextAction,
    lastEmailId: email.id,
    lastMessageAt: email.receivedAt,
    lastClassification: classification,
    sender: email.sender,
    needsFullAnalysis: updated.needsFullAnalysis,
  })
}

// ── Step 3: Match or create matter ───────────────────────────

/**
 * Conservative matter matching:
 *   1. Rule-based candidate filter (topic + participants, recent window)
 *   2. AI judgment only if candidates exist (fast model)
 *   3. Accept only if AI confidence >= MATTER_MATCH_THRESHOLD
 *   4. Otherwise create new matter
 *
 * Always returns a MatterMemory — either existing or newly created.
 */
async function stepMatchOrCreateMatter(
  userId: string,
  threadMemory: ThreadMemory,
  threadId: string
): Promise<MatterMemory> {
  // Thread is already linked to a matter — just update matter stats
  if (threadMemory.matterId) {
    const matter = await matterMemoryRepo.findById(threadMemory.matterId)
    if (matter) {
      return matterMemoryRepo.updateFromThread(matter.id, threadMemory)
    }
    // matter was deleted — fall through to create a new one
  }

  // Find rule-based candidates
  const candidates = await matterMemoryRepo.findCandidates(userId, {
    topic: threadMemory.topic,
    participants: threadMemory.participants,
    title: threadMemory.title,
  })

  let matchedMatterId: string | null = null

  if (candidates.length > 0) {
    // Ask AI to decide (conservative — prefers null)
    const decision = await matchMatter({
      threadTitle: threadMemory.title,
      threadTopic: threadMemory.topic,
      threadSummary: threadMemory.summary,
      candidates: candidates.map((m) => ({
        id: m.id,
        title: m.title,
        topic: m.topic,
        summary: m.summary,
        status: m.status,
        lastMessageAt: m.lastMessageAt?.toISOString() ?? '',
      })),
    })

    if (decision.matterId && decision.confidence >= MATTER_MATCH_THRESHOLD) {
      matchedMatterId = decision.matterId
    }
  }

  if (matchedMatterId) {
    // Merge this thread into the existing matter
    const matter = await matterMemoryRepo.mergeThread(matchedMatterId, threadMemory)
    await threadMemoryRepo.setMatter(userId, threadId, matter.id)
    return matter
  }

  // No confident match — create a new matter seeded from this thread
  const newMatter = await matterMemoryRepo.createFromThread(userId, threadMemory)
  await threadMemoryRepo.setMatter(userId, threadId, newMatter.id)
  return newMatter
}

// ── Step 4: Extract task ─────────────────────────────────────

async function stepExtractTask(
  email: {
    subject: string
    sender: string
    receivedAt: Date
    bodyPreview: string
    bodyFull: string | null
  },
  memoryContext: string,
  threadMemory: ThreadMemory | null
) {
  const rawBody = email.bodyFull || email.bodyPreview
  const cleanedBody = prepareForExtraction(rawBody)

  // Pass thread memory as lightweight thread context (avoids re-sending full bodies)
  const threadContext =
    threadMemory && threadMemory.emailCount > 1
      ? [
          {
            sender: `[thread summary: ${threadMemory.summary}]`,
            date: threadMemory.lastMessageAt?.toISOString() ?? email.receivedAt.toISOString(),
            bodyPreview: `Status: ${threadMemory.status}${threadMemory.nextAction ? ` | Next action: ${threadMemory.nextAction}` : ''}`,
          },
        ]
      : undefined

  return extractTask({
    subject: email.subject,
    sender: email.sender,
    date: email.receivedAt.toISOString(),
    bodyPreview: email.bodyPreview,
    body: cleanedBody,
    memory: memoryContext,
    threadContext,
  })
}

// ── Step 5: Score priority ────────────────────────────────────

async function stepScorePriority(
  extraction: { title: string; summary: string; actionItems: string[] },
  sender: string,
  memoryContext: string
) {
  return scorePriority({
    title: extraction.title,
    summary: extraction.summary,
    actionItems: extraction.actionItems,
    sender,
    currentDate: new Date().toISOString().split('T')[0],
    memory: memoryContext,
  })
}

function normalizeTaskCandidates(extraction: unknown): TaskCandidate[] {
  if (
    extraction &&
    typeof extraction === 'object' &&
    'tasks' in extraction &&
    Array.isArray((extraction as { tasks?: unknown }).tasks)
  ) {
    return (extraction as { tasks: TaskCandidate[] }).tasks.filter((candidate) => candidate?.title)
  }

  // Backward-compatible guard for tests, stale workers, or partially deployed code
  // that still returns the former single-task extraction object.
  if (extraction && typeof extraction === 'object' && 'title' in extraction) {
    const candidate = extraction as TaskCandidate
    return candidate.title ? [{ ...candidate, splitReason: candidate.splitReason ?? null }] : []
  }

  return []
}

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2)
}

function hasHighTaskSimilarity(candidate: TaskCandidate, existing: { title: string; summary: string }) {
  const candidateTitle = normalizeForMatch(candidate.title)
  const existingTitle = normalizeForMatch(existing.title)
  if (!candidateTitle.length || !existingTitle.length) return false

  const existingSet = new Set(existingTitle)
  const overlap = candidateTitle.filter((token) => existingSet.has(token)).length
  const titleScore = overlap / Math.max(candidateTitle.length, existingTitle.length)

  const summaryMatches =
    candidate.summary.length > 20 &&
    existing.summary.length > 20 &&
    candidate.summary.toLowerCase().includes(existing.summary.toLowerCase().slice(0, 40))

  return titleScore >= 0.75 || summaryMatches
}

async function findSimilarActiveTask(
  userId: string,
  candidate: TaskCandidate,
  matterId: string | null | undefined,
  threadId: string | null,
  primaryTaskId?: string | null,
  emailId?: string | null
) {
  if (!matterId && !threadId && !primaryTaskId && !emailId) return null

  const tasks = await prisma.task.findMany({
    where: {
      userId,
      archivedAt: null,
      status: { in: ['ai_suggestion', 'active'] },
      OR: [
        ...(primaryTaskId ? [{ id: primaryTaskId }] : []),
        ...(matterId ? [{ matterId }] : []),
        ...(threadId ? [{ emailLinks: { some: { email: { threadId } } } }] : []),
        ...(emailId ? [{ emailLinks: { some: { emailId } } }] : []),
      ],
    },
    select: { id: true, title: true, summary: true },
    take: 30,
  })

  return tasks.find((task) => hasHighTaskSimilarity(candidate, task)) ?? null
}

async function linkEmailToTask(taskId: string, emailId: string, relationship = 'follow_up') {
  try {
    await prisma.taskEmail.create({
      data: { taskId, emailId, relationship },
    })
  } catch {
    // unique constraint or stale link; already linked is fine for pipeline idempotency
  }
  await emailRepo.markActioned(emailId)
}

// ── Sender memory update ──────────────────────────────────────

async function updateSenderMemory(
  userId: string,
  sender: string,
  category: 'action' | 'awareness' | 'ignore',
) {
  await senderMemoryRepo.incrementSenderMemory(userId, sender, category)
}

// ── Main pipeline ─────────────────────────────────────────────

export async function processEmail(
  userId: string,
  email: ProcessEmailInput
): Promise<PipelineResult> {
  // Tracks whether classification has been persisted to the DB.
  // Once true, a later step failure must NOT overwrite the saved
  // classification with markClassificationFailed (the historical bug
  // where action emails regressed to uncertain "Classification failed"
  // when extractTask / scorePriority threw).
  const savedClassification: SavedClassificationState = {
    saved: false,
    category: null,
    confidence: 0,
  }
  try {
  // ── 0. Pre-filter (rule-based, no AI) ─────────────────────
  const ruleResult = await processEmailRuleOnly(email)
  if (ruleResult) {
    savedClassification.saved = true
    return ruleResult
  }

  const threadId = email.threadId ?? null

  // ── 1. Load existing thread memory ────────────────────────
  const existingThreadMemory = threadId
    ? await threadMemoryRepo.findByThread(userId, threadId)
    : null

  // At this point we may already know the matter from an existing thread.
  // Load it for use in memory context during classification.
  const existingMatterMemory =
    existingThreadMemory?.matterId
      ? await matterMemoryRepo.findById(existingThreadMemory.matterId)
      : null

  // ── 2. Build memory context (global + sender + matter/thread) ──
  const memoryContext = await buildMemoryContext(
    userId,
    email.sender,
    existingThreadMemory,
    existingMatterMemory
  )

  // ── 3. Classify ────────────────────────────────────────────
  const classification = email.forceAction
    ? {
        category: 'action',
        confidence: 1,
        reasoning: 'User confirmed this email should be extracted into a task',
        isWorkRelated: true,
      }
    : await stepClassify(email, memoryContext)
  await updateSenderMemory(userId, email.sender, classification.category)

  const classificationStage = await persistClassificationStage({
    email,
    classification,
    savedClassification,
  })
  if (classificationStage.shouldReturn) return classificationStage.result!

  let currentThreadMemory: ThreadMemory | null = existingThreadMemory
  let currentMatterMemory: MatterMemory | null = existingMatterMemory
  let currentMemoryContext = memoryContext
  let reviewCandidate: PipelineReviewCandidate | undefined

  // ── 4. Ignore: no thread memory, no matter matching ────────
  // ── 4. Ignore: no thread memory, no matter matching ────────
  if (classificationStage.classification.category === 'ignore') {
    return buildNoTaskResult(
      email.id,
      classificationStage.classification.category,
      classificationStage.classification.confidence,
    )
  }

  // ── 5. Update thread memory ────────────────────────────────
  //    awareness + action both update thread memory.
  //    Uses bodyFull when available so the summary reflects the full content.
  if (threadId) {
    currentThreadMemory = await stepUpdateThreadMemory(
      userId,
      email,
      threadId,
      existingThreadMemory,
      classificationStage.classification.category
    )

    if (classificationStage.classification.category === 'action') {
      // Rebuild memory context with the freshly updated thread state so that
      // extractTask and scorePriority operate on current information.
      currentMemoryContext = await buildMemoryContext(
        userId,
        email.sender,
        currentThreadMemory,
        existingMatterMemory
      )

      // ── 6. Match or create matter (action only) ──────────
      currentMatterMemory = await stepMatchOrCreateMatter(userId, currentThreadMemory, threadId)
      const assignment = await stepAssignProjectAndIdentity(userId, email, currentMatterMemory)
      currentMatterMemory = assignment.matter
      reviewCandidate = buildReviewCandidate(email.id, currentMatterMemory, assignment)
    }
  }

  // ── 7. Non-action emails: done (awareness, uncertain) ──────
  if (classificationStage.classification.category !== 'action') {
    return buildNoTaskResult(
      email.id,
      classificationStage.classification.category,
      classificationStage.classification.confidence,
    )
  }

  // ── 8. Task dedup — matter level (broadest check) ─────────
  //    If this matter already has a primary task, link the
  //    email as a follow-up instead of creating a duplicate.
  const extractionResult = await stepExtractTask(email, currentMemoryContext, currentThreadMemory)
  const candidates = normalizeTaskCandidates(extractionResult)

  if (candidates.length === 0) {
    // Return structurally so callers (e.g. manual Extract-to-Task) can
    // distinguish "AI found nothing" from a real failure and toast accordingly.
    return buildNoTaskResult(email.id, classificationStage.classification.category, classificationStage.classification.confidence, {
      taskIds: [],
      createdTaskIds: [],
      dedupedTaskIds: [],
      noCandidates: true,
      reviewCandidate,
    })
  }

  if (candidates.length === 1 && currentMatterMemory?.linkedPrimaryTaskId) {
    const existingTaskId = currentMatterMemory.linkedPrimaryTaskId

    await linkEmailToTask(existingTaskId, email.id)

    return buildDedupedTaskResult(
      email.id,
      classificationStage.classification.category,
      classificationStage.classification.confidence,
      existingTaskId,
      reviewCandidate,
    )
  }

  // ── 9. Task dedup — thread level (fallback for no-threadId emails) ──
  if (candidates.length === 1 && currentThreadMemory?.linkedTaskId) {
    const existingTaskId = currentThreadMemory.linkedTaskId

    await linkEmailToTask(existingTaskId, email.id)

    return buildDedupedTaskResult(
      email.id,
      classificationStage.classification.category,
      classificationStage.classification.confidence,
      existingTaskId,
      reviewCandidate,
    )
  }

  // ── 10. Extract task ───────────────────────────────────────
  // ── 11. Score priority ─────────────────────────────────────
  const taskIds: string[] = []
  const createdTaskIds: string[] = []
  const dedupedTaskIds: string[] = []
  const targetStatus = email.taskStatus ?? 'ai_suggestion'

  for (const candidate of candidates) {
    const similarTask = await findSimilarActiveTask(
      userId,
      candidate,
      currentMatterMemory?.id,
      threadId,
      currentMatterMemory?.linkedPrimaryTaskId ?? currentThreadMemory?.linkedTaskId,
      email.id
    )

    if (similarTask) {
      await linkEmailToTask(similarTask.id, email.id)
      taskIds.push(similarTask.id)
      dedupedTaskIds.push(similarTask.id)
      continue
    }

    const priority = await stepScorePriority(candidate, email.sender, currentMemoryContext)
    const task = await taskRepo.createTask({
      userId,
      emailId: email.id,
      extraction: candidate,
      priority,
      status: targetStatus,
    })

    taskIds.push(task.id)
    createdTaskIds.push(task.id)
  }

  const primaryTaskId = createdTaskIds[0] ?? taskIds[0]

  // ── 13. Link task to thread + matter ──────────────────────
  if (primaryTaskId && threadId && currentThreadMemory && !currentThreadMemory.linkedTaskId) {
    await threadMemoryRepo.linkTask(userId, threadId, primaryTaskId)
  }

  if (primaryTaskId && currentMatterMemory && !currentMatterMemory.linkedPrimaryTaskId) {
    await matterMemoryRepo.linkPrimaryTask(currentMatterMemory.id, primaryTaskId)
  }

  // ── 14. Mark email as actioned ──────────────────────
  // Any email that ends up linked to a task (newly created or merged into an
  // existing similar task) has been "handled" — actioned=true takes it out
  // of the Needs Review bucket and into Tracked.
  if (taskIds.length > 0) {
    await emailRepo.markActioned(email.id)
  }

  if (reviewCandidate) reviewCandidate.taskId = primaryTaskId

  return {
    emailId: email.id,
    classification: classificationStage.classification.category,
    confidence: classificationStage.classification.confidence,
    taskCreated: createdTaskIds.length > 0,
    taskId: primaryTaskId,
    taskIds,
    createdTaskIds,
    dedupedTaskIds,
    skippedByRule: false,
    reviewCandidate,
  }
  } catch (err) {
    const stage = savedClassification.saved ? 'post-classify' : 'classify'
    console.error(`[processEmail] ${stage} error for ${email.id}:`, err)
    Sentry.captureException(err, {
      tags: { action: 'processEmail', stage },
      extra: { userId },
    })

    if (!savedClassification.saved) {
      // Real classify failure — safe to mark the email as failed since no
      // classification has been persisted yet.
      try {
        await emailRepo.markClassificationFailed(email.id)
      } catch (dbErr) {
        console.error('[processEmail] failed to mark email as failed', email.id, dbErr)
      }
      return buildNoTaskResult(email.id, 'uncertain', 0)
    }

    // Classification already saved — a later step (thread memory / matter /
    // extract / score / task creation) threw. Leave the saved classification
    // alone so the email does not regress in the UI. The user can manually
    // trigger task extraction from the email detail page if needed.
    return buildNoTaskResult(
      email.id,
      savedClassification.category ?? 'uncertain',
      savedClassification.confidence,
    )
  }
}

// Clears awaitingReview on an email and re-runs the full pipeline to create a task.
// Called when the user clicks "Extract to Task" in the manual review modal.
// Uses an atomic updateMany so concurrent clicks on the same email are harmless.
export async function createTaskFromClassifiedEmail(
  userId: string,
  emailId: string,
  taskStatus: 'ai_suggestion' | 'active' = 'ai_suggestion'
): Promise<PipelineResult | null> {
  // Atomic claim: only the first caller sees count=1; subsequent callers see count=0
  const { count } = await emailRepo.claimAwaitingReviewEmail(userId, emailId)

  if (count === 0) return null

  const email = await emailRepo.findEmailForPipelineById(userId, emailId)
  if (!email) return null

  return processEmail(userId, {
    id: email.id,
    subject: email.subject,
    sender: email.sender,
    receivedAt: email.receivedAt,
    bodyPreview: email.bodyPreview,
    bodyFull: email.bodyFull,
    labels: email.labels,
    threadId: email.threadId,
    awaitingReview: false,
    taskStatus,
  })
}
