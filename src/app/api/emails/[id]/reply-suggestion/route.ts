export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { generateReplyDraft } from '@/ai'
import { error, errorFromException, getAuthUser, success } from '@/lib/api-helpers'
import { getPriorityBand, getPriorityLabel, getTaskStatusLabel } from '@/types'
import * as emailRepo from '@/repositories/email-repo'

type ChecklistItem = {
  id?: string
  text?: string
  completed?: boolean
}

type LinkedTask = {
  id: string
  title: string
  summary?: string | null
  actionItems?: string | null
  checkedActionItems?: string | null
  status: string
  priorityScore?: number | null
  startDate?: Date | string | null
  explicitDeadline?: Date | string | null
  inferredDeadline?: Date | string | null
  userSetDeadline?: Date | string | null
  userNotes?: string | null
}

type EmailWithTasks = {
  id: string
  subject: string
  sender: string
  receivedAt: Date | string
  bodyPreview: string
  bodyFull?: string | null
  classification?: string | null
  classReasoning?: string | null
  retentionStatus?: string | null
  taskLinks?: Array<{ task: LinkedTask }>
}

function parseActionItems(raw?: string | null): ChecklistItem[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        if (typeof item === 'string') return { text: item }
        if (item && typeof item === 'object') return item as ChecklistItem
        return null
      })
      .filter((item): item is ChecklistItem => !!item?.text)
  } catch {
    return []
  }
}

function parseCheckedIds(raw?: string | null) {
  if (!raw) return new Set<string>()
  try {
    const parsed = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

function toDateOnly(value?: Date | string | null) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function getDueDate(task: LinkedTask) {
  return task.userSetDeadline ?? task.explicitDeadline ?? task.inferredDeadline ?? null
}

function buildTaskContext(task: LinkedTask) {
  const items = parseActionItems(task.actionItems)
  const checkedIds = parseCheckedIds(task.checkedActionItems)
  const completedItems = items.filter((item) => item.id && checkedIds.has(item.id)).map((item) => item.text!)
  const priorityBand = getPriorityBand(task.priorityScore ?? 0)

  return {
    title: task.title,
    summary: task.summary ?? '',
    status: getTaskStatusLabel(task.status),
    priority: getPriorityLabel(priorityBand),
    startDate: toDateOnly(task.startDate),
    dueDate: toDateOnly(getDueDate(task)),
    checklistItems: items.map((item) => item.text!),
    completedChecklistItems: completedItems,
    userNotes: task.userNotes ?? null,
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    const { id } = await params
    const email = await emailRepo.findEmailById(user.id, id) as EmailWithTasks | null
    if (!email) return error('NOT_FOUND', 'Email not found', 404)

    const body = (email.bodyFull || email.bodyPreview || '').trim()
    if (email.retentionStatus === 'PURGED' || body.length < 10) {
      return error(
        'EMAIL_CONTENT_UNAVAILABLE',
        'This email does not have enough available content to generate a reply draft.',
        400
      )
    }

    const linkedTasks = email.taskLinks?.map((link) => link.task) ?? []
    const shouldAllow = email.classification === 'action' || linkedTasks.length > 0
    if (!shouldAllow) {
      return error('NOT_ACTIONABLE', 'Reply drafts are available for action emails or emails with linked tasks.', 400)
    }

    const result = await generateReplyDraft({
      subject: email.subject,
      sender: email.sender,
      receivedAt: new Date(email.receivedAt).toISOString(),
      body,
      classification: email.classification,
      classReasoning: email.classReasoning,
      tasks: linkedTasks.map(buildTaskContext),
    })

    await emailRepo.updateReplyDraft(user.id, id, result.reply, true)
    return success({ reply: result.reply })
  } catch (err) {
    return errorFromException(err, 'REPLY_DRAFT_FAILED', 'Failed to generate reply draft', 500)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    const { id } = await params
    const body = await req.json()
    const draft = typeof body.reply === 'string' ? body.reply.trim() : ''
    if (!draft) return error('BAD_REQUEST', 'Reply draft cannot be empty', 400)
    if (draft.length > 4000) return error('BAD_REQUEST', 'Reply draft is too long', 400)

    const updated = await emailRepo.updateReplyDraft(user.id, id, draft)
    if (updated.count === 0) return error('NOT_FOUND', 'Email not found', 404)

    return success({ reply: draft })
  } catch (err) {
    return errorFromException(err, 'REPLY_DRAFT_SAVE_FAILED', 'Failed to save reply draft', 500)
  }
}
