import { prisma } from '@/lib/prisma'

// ============================================================
// Thread Memory Repository — thread/matter-level memory storage
// One record per (userId, threadId). Tracks the living state
// of an email thread so subsequent emails can skip redundant
// full-body analysis and avoid duplicate task creation.
// ============================================================

export type ThreadMemory = {
  id: string
  userId: string
  threadId: string
  title: string
  topic: string
  summary: string
  status: string
  nextAction: string | null
  matterId: string | null
  linkedTaskId: string | null
  lastEmailId: string | null
  lastMessageAt: Date | null
  emailCount: number
  lastClassification: string | null
  participants: string[]
  needsFullAnalysis: boolean
  confidence: number
  createdAt: Date
  updatedAt: Date
}

export interface UpsertThreadMemoryData {
  title: string
  topic: string
  summary: string
  status: string
  nextAction?: string | null
  lastEmailId: string
  lastMessageAt: Date
  lastClassification: string
  sender: string
  needsFullAnalysis: boolean
}

export async function findByThread(
  userId: string,
  threadId: string
): Promise<ThreadMemory | null> {
  const raw = await prisma.threadMemory.findUnique({
    where: { userId_threadId: { userId, threadId } },
  })
  return raw ? mapRow(raw) : null
}

export async function upsert(
  userId: string,
  threadId: string,
  data: UpsertThreadMemoryData
): Promise<ThreadMemory> {
  const existing = await prisma.threadMemory.findUnique({
    where: { userId_threadId: { userId, threadId } },
    select: { participants: true },
  })

  const participants = mergeParticipants(existing?.participants as string[] | null, data.sender)

  if (!existing) {
    return mapRow(await prisma.threadMemory.create({
      data: {
        userId,
        threadId,
        title: data.title,
        topic: data.topic,
        summary: data.summary,
        status: data.status,
        nextAction: data.nextAction ?? null,
        lastEmailId: data.lastEmailId,
        lastMessageAt: data.lastMessageAt,
        lastClassification: data.lastClassification,
        participants,
        emailCount: 1,
        needsFullAnalysis: data.needsFullAnalysis,
      },
    }))
  }

  return mapRow(await prisma.threadMemory.update({
    where: { userId_threadId: { userId, threadId } },
    data: {
      title: data.title,
      topic: data.topic,
      summary: data.summary,
      status: data.status,
      nextAction: data.nextAction ?? null,
      lastEmailId: data.lastEmailId,
      lastMessageAt: data.lastMessageAt,
      lastClassification: data.lastClassification,
      participants,
      emailCount: { increment: 1 },
      needsFullAnalysis: data.needsFullAnalysis,
    },
  }))
}

/**
 * Set the primary task linked to this thread.
 * Called once after the first task is created for a thread.
 */
export async function linkTask(
  userId: string,
  threadId: string,
  taskId: string
): Promise<void> {
  await prisma.threadMemory.update({
    where: { userId_threadId: { userId, threadId } },
    data: { linkedTaskId: taskId },
  })
}

/**
 * Upsert a thread → matter binding for a manual reassignment.
 * Used by the Reassign UI in batch and single-thread flows.
 */
export async function upsertManualMatterAssignment(input: {
  userId: string
  threadId: string
  matterId: string
  projectName: string
}): Promise<void> {
  const { userId, threadId, matterId, projectName } = input
  await prisma.threadMemory.upsert({
    where: { userId_threadId: { userId, threadId } },
    update: { matterId },
    create: {
      userId,
      threadId,
      matterId,
      title: projectName,
      summary: 'Manually assigned',
    },
  })
}

/**
 * Associate a thread with a matter.
 * Called after matter matching succeeds or a new matter is created.
 */
export async function setMatter(
  userId: string,
  threadId: string,
  matterId: string
): Promise<void> {
  await prisma.threadMemory.update({
    where: { userId_threadId: { userId, threadId } },
    data: { matterId },
  })
}

// ── helpers ───────────────────────────────────────────────────

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

// Prisma returns Json columns as JsonValue; map them to typed fields at the boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(raw: any): ThreadMemory {
  return { ...raw, participants: asStringArray(raw.participants) }
}

function mergeParticipants(existing: string[] | null, newSender: string): string[] {
  const arr = existing ?? []
  return arr.includes(newSender) ? arr : [...arr, newSender]
}
