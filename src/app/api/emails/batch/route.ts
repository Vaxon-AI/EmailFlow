export const dynamic = 'force-dynamic'
import { after } from 'next/server'
import { errorFromException, getAuthUser, success, error } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import * as emailRepo from '@/repositories/email-repo'
import { processEmail } from '@/workflows'
import { getExtractRemaining, incrementExtractUsed } from '@/lib/quota'

type BatchAction = 'reassign' | 'ignore' | 'generate_tasks' | 'classify'

type BatchBody = {
  ids: string[]
  action: BatchAction
  projectId?: string
  bucket?: emailRepo.EmailBucket
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser()
    const { ids, action, projectId, bucket }: BatchBody = await req.json()

    if (!ids || ids.length === 0) return error('BAD_REQUEST', 'ids is required', 400)
    if (!action) return error('BAD_REQUEST', 'action is required', 400)

    if (action === 'reassign') {
      if (!projectId) return error('BAD_REQUEST', 'projectId is required for reassign', 400)

      const project = await prisma.projectContext.findFirst({
        where: { id: projectId, userId: user.id },
      })
      if (!project) return error('NOT_FOUND', 'Project not found', 404)

      let matter = await prisma.matterMemory.findFirst({
        where: { userId: user.id, projectContextId: projectId },
      })
      if (!matter) {
        matter = await prisma.matterMemory.create({
          data: {
            userId: user.id,
            projectContextId: projectId,
            title: project.name,
            summary: 'Manually assigned to this project',
            status: 'open',
            topic: 'other',
          },
        })
      }

      const emails = await prisma.email.findMany({
        where: { id: { in: ids }, userId: user.id },
        select: { threadId: true },
      })
      const threadIds = [...new Set(emails.map((e) => e.threadId).filter((t): t is string => !!t))]

      await Promise.all(
        threadIds.map((threadId) =>
          prisma.threadMemory.upsert({
            where: { userId_threadId: { userId: user.id, threadId } },
            update: { matterId: matter!.id },
            create: {
              userId: user.id,
              threadId,
              matterId: matter!.id,
              title: project.name,
              summary: 'Manually assigned',
            },
          })
        )
      )

      return success({ affected: threadIds.length })
    }

    if (action === 'ignore') {
      // Soft delete: collapse the selected emails into the ignore bucket.
      // DB rows stay so the next email sync still dedups by provider message id.
      const result = await emailRepo.bulkIgnoreEmails(user.id, ids)
      return success({ affected: result?.count ?? 0 })
    }

    if (action === 'classify') {
      const valid: emailRepo.EmailBucket[] = ['needs_action', 'tracked', 'fyi', 'ignored']
      if (!bucket || !valid.includes(bucket)) {
        return error('BAD_REQUEST', 'Valid bucket is required for classify', 400)
      }

      const result = await emailRepo.bulkSetEmailBucket(user.id, ids, bucket)
      return success({ affected: result?.count ?? 0, bucket })
    }

    if (action === 'generate_tasks') {
      // Needs Action and Unclassified emails can generate tasks. Anything with
      // an existing task link is already tracked and is skipped.
      const eligible = await prisma.email.findMany({
        where: {
          id: { in: ids },
          userId: user.id,
          actioned: false,
          taskLinks: { none: {} },
          OR: [
            { classification: 'action' },
            { classification: 'uncertain' },
            { classification: null },
          ],
        },
        select: {
          id: true,
          subject: true,
          sender: true,
          receivedAt: true,
          bodyPreview: true,
          bodyFull: true,
          labels: true,
          threadId: true,
        },
      })

      // Cap to remaining extract quota so a user with 5 extracts left can't
      // accidentally fire 50 background jobs that all error out at the AI step.
      const remaining = await getExtractRemaining(user.id)
      const isPro = remaining === Infinity
      const cap = isPro ? eligible.length : Math.min(eligible.length, remaining)
      const accepted = eligible.slice(0, cap)
      const skippedIneligible = ids.length - eligible.length
      const skippedQuota = eligible.length - cap

      // Pre-charge quota for the accepted batch. We do this upfront (before
      // pipeline kicks off) to prevent races where the user clicks "Generate"
      // again while the first batch is still running and double-spends quota.
      if (!isPro && accepted.length > 0) {
        for (let i = 0; i < accepted.length; i++) {
          await incrementExtractUsed(user.id)
        }
      }

      // Run pipeline jobs in the background — the user gets an immediate
      // response with what we've queued vs skipped, and the emails page will
      // surface results as they're processed (Tracked count goes up).
      const userId = user.id
      after(async () => {
        for (const email of accepted) {
          try {
            await processEmail(userId, {
              id: email.id,
              subject: email.subject,
              sender: email.sender,
              receivedAt: email.receivedAt,
              bodyPreview: email.bodyPreview,
              bodyFull: email.bodyFull,
              labels: email.labels,
              threadId: email.threadId,
              awaitingReview: false,
              taskStatus: 'ai_suggestion',
              forceAction: true,
            })
          } catch (err) {
            console.error(`[batch generate_tasks] processEmail failed for ${email.id}:`, err)
          }
        }
      })

      return success({
        queued: accepted.length,
        skippedIneligible,
        skippedQuota,
        quotaExhausted: !isPro && remaining - cap <= 0,
      })
    }

    return error('BAD_REQUEST', `Unknown action: ${action}`, 400)
  } catch (err) {
    console.error('[api/emails/batch]', err)
    return errorFromException(err, 'INTERNAL', 'Batch operation failed', 500)
  }
}
