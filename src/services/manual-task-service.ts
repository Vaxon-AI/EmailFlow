import { prisma } from '@/lib/prisma'
import * as emailRepo from '@/repositories/email-repo'
import { ensureMatterForProject } from '@/services/project-matter-service'
import { syncThreadMattersForTasks } from '@/services/task-matter-sync-service'

type ManualTaskSource = 'manual' | 'copy_text'

type CreateManualTaskInput = {
  userId: string
  title: string
  summary?: string | null
  actionItems?: string | string[] | null
  userSetDeadline?: string | Date | null
  startDate?: string | Date | null
  urgency?: number | null
  impact?: number | null
  priorityScore?: number | null
  projectId?: string | null
  source?: ManualTaskSource | null
  emailIds?: string[]
  markLinkedEmailsActioned?: boolean
  emptyActionItemsValue?: string
}

type TaskSource = NonNullable<CreateManualTaskInput['source']>

function normalizeDate(value: string | Date | null | undefined) {
  if (!value) return undefined
  return value instanceof Date ? value : new Date(value)
}

function normalizeActionItems(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) return JSON.stringify(value)
  return value ?? undefined
}

function resolveTaskSource(input: CreateManualTaskInput): TaskSource {
  return input.source ?? 'manual'
}

function resolveTaskStatus(source: TaskSource) {
  return source === 'copy_text' ? 'ai_suggestion' : 'active'
}

function buildTaskCreateData(
  input: CreateManualTaskInput,
  source: TaskSource,
  matterId?: string | null
) {
  const status = resolveTaskStatus(source)

  return {
    userId: input.userId,
    title: input.title,
    summary: input.summary || '',
    status,
    activeAt: status === 'active' ? new Date() : null,
    urgency: input.urgency ?? 3,
    impact: input.impact ?? 3,
    priorityScore: input.priorityScore ?? 9,
    actionItems: normalizeActionItems(input.actionItems) ?? input.emptyActionItemsValue,
    userSetDeadline: normalizeDate(input.userSetDeadline),
    startDate: normalizeDate(input.startDate),
    source,
    matterId: matterId ?? undefined,
  }
}

function normalizeEmailIds(emailIds: string[] | undefined) {
  return Array.isArray(emailIds) ? emailIds : []
}

async function linkOwnedEmailsToTask(input: {
  userId: string
  taskId: string
  emailIds: string[]
  markLinkedEmailsActioned?: boolean
}) {
  if (input.emailIds.length === 0) return

  const ownedEmails = await prisma.email.findMany({
    where: { id: { in: input.emailIds }, userId: input.userId },
    select: { id: true },
  })

  if (ownedEmails.length === 0) return

  await prisma.taskEmail.createMany({
    data: ownedEmails.map((email) => ({
      taskId: input.taskId,
      emailId: email.id,
      relationship: 'source',
    })),
    skipDuplicates: true,
  })

  if (input.markLinkedEmailsActioned) {
    await emailRepo.bulkMarkActioned(input.userId, ownedEmails.map((email) => email.id))
  }
}

export async function createManualTask(input: CreateManualTaskInput) {
  const taskSource = resolveTaskSource(input)
  const matter = input.projectId
    ? await ensureMatterForProject(input.userId, input.projectId)
    : null

  const task = await prisma.task.create({
    data: buildTaskCreateData(input, taskSource, matter?.id),
  })

  await linkOwnedEmailsToTask({
    userId: input.userId,
    taskId: task.id,
    emailIds: normalizeEmailIds(input.emailIds),
    markLinkedEmailsActioned: input.markLinkedEmailsActioned,
  })

  if (matter && normalizeEmailIds(input.emailIds).length > 0) {
    await syncThreadMattersForTasks({
      userId: input.userId,
      taskIds: [task.id],
      matterId: matter.id,
      projectName: matter.projectName,
    })
  }

  return task
}
