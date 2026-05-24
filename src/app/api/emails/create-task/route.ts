export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { errorFromException, getAuthUser, success, error } from '@/lib/api-helpers'
import * as emailRepo from '@/repositories/email-repo'
import { getExtractRemaining, incrementExtractUsed, FREE_EXTRACT_LIMIT } from '@/lib/quota'
import { createManualTask } from '@/services/manual-task-service'

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser()
    const { title, summary, sourceEmailId, linkedEmailIds, urgency, impact, priorityScore, userSetDeadline, startDate, actionItems, projectId } = await req.json()

    if (!title || !sourceEmailId) {
      return error('BAD_REQUEST', 'Title and sourceEmailId are required', 400)
    }

    if (user.plan === 'free') {
      const remaining = await getExtractRemaining(user.id)
      if (remaining <= 0) {
        return error('QUOTA_EXCEEDED', `Free plan limit of ${FREE_EXTRACT_LIMIT} manual task extractions per month reached. Upgrade to Pro for unlimited access.`, 402)
      }
    }

    const emailIds = linkedEmailIds && linkedEmailIds.length > 0
      ? linkedEmailIds
      : [sourceEmailId]
    const task = await createManualTask({
      userId: user.id,
      title,
      summary,
      actionItems,
      userSetDeadline,
      startDate,
      urgency,
      impact,
      priorityScore,
      projectId,
      source: 'manual',
      emailIds,
      markLinkedEmailsActioned: false,
      emptyActionItemsValue: undefined,
    })

    // Manually creating a task is an explicit "I'm handling this" signal —
    // move every linked email into the Tracked bucket so it stops showing up
    // in Needs Action. Per-email catch so one bad row doesn't fail the request.
    await Promise.all(
      emailIds.map((emailId: string) =>
        emailRepo.setEmailBucket(emailId, 'tracked').catch((err: unknown) => {
          console.error('[create-task] failed to move email to tracked', emailId, err)
        })
      )
    )

    if (user.plan === 'free') {
      await incrementExtractUsed(user.id)
    }

    return success(task)
  } catch (err) {
    console.error('[api/emails/create-task]', err)
    return errorFromException(err, 'INTERNAL_ERROR', 'Failed to create task', 500)
  }
}
