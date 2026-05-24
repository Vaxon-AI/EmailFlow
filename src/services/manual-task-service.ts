import { prisma } from '@/lib/prisma'
import * as emailRepo from '@/repositories/email-repo'
import { ensureMatterForProject } from '@/services/project-matter-service'

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

function normalizeDate(value: string | Date | null | undefined) {
  if (!value) return undefined
  return value instanceof Date ? value : new Date(value)
}

function normalizeActionItems(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) return JSON.stringify(value)
  return value ?? undefined
}

export async function createManualTask(input: CreateManualTaskInput) {
  const taskSource = input.source ?? 'manual'
  const taskStatus = taskSource === 'copy_text' ? 'ai_suggestion' : 'active'
  const matter = input.projectId
    ? await ensureMatterForProject(input.userId, input.projectId)
    : null

  const task = await prisma.task.create({
    data: {
      userId: input.userId,
      title: input.title,
      summary: input.summary || '',
      status: taskStatus,
      activeAt: taskStatus === 'active' ? new Date() : null,
      urgency: input.urgency ?? 3,
      impact: input.impact ?? 3,
      priorityScore: input.priorityScore ?? 9,
      actionItems: normalizeActionItems(input.actionItems) ?? input.emptyActionItemsValue,
      userSetDeadline: normalizeDate(input.userSetDeadline),
      startDate: normalizeDate(input.startDate),
      source: taskSource,
      matterId: matter?.id,
    },
  })

  const emailIds = Array.isArray(input.emailIds) ? input.emailIds : []
  if (emailIds.length > 0) {
    const ownedEmails = await prisma.email.findMany({
      where: { id: { in: emailIds }, userId: input.userId },
      select: { id: true },
    })

    if (ownedEmails.length > 0) {
      await prisma.taskEmail.createMany({
        data: ownedEmails.map((email) => ({
          taskId: task.id,
          emailId: email.id,
          relationship: 'source',
        })),
        skipDuplicates: true,
      })

      if (input.markLinkedEmailsActioned) {
        await emailRepo.bulkMarkActioned(input.userId, ownedEmails.map((email) => email.id))
      }
    }
  }

  return task
}
