import { defineRoute, error, getAuthUser, success } from '@/lib/api-helpers'
import * as emailRepo from '@/repositories/email-repo'
import { FREE_EXTRACT_LIMIT, getExtractRemaining, incrementExtractUsed } from '@/lib/quota'
import { createTaskFromClassifiedEmail, processEmail } from '@/workflows'

function summarizeExtractionResult(result: {
  createdTaskIds?: string[]
  dedupedTaskIds?: string[]
  noCandidates?: boolean
}) {
  return {
    created: result.createdTaskIds?.length ?? 0,
    deduped: result.dedupedTaskIds?.length ?? 0,
    noCandidates: result.noCandidates ?? false,
  }
}

async function incrementUsageIfNeeded(userId: string, plan: string, summary: { created: number; deduped: number }) {
  if (plan === 'free' && (summary.created > 0 || summary.deduped > 0)) {
    await incrementExtractUsed(userId)
  }
}

export const POST = defineRoute(
  { tag: 'api/emails/[id]/extract-task POST', code: 'EXTRACT_FAILED', message: 'Failed to extract task' },
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await getAuthUser()
    const { id: emailId } = await params

    const email = await emailRepo.findEmailById(user.id, emailId)
    if (!email) return error('NOT_FOUND', 'Email not found', 404)
    const canExtract = email.classification === 'action' || email.classification === 'uncertain' || !email.classification
    if (!canExtract) {
      return error('INVALID_STATE', 'Only Needs Action or Unclassified emails can be extracted into tasks', 400)
    }

    if (user.plan === 'free') {
      const remaining = await getExtractRemaining(user.id)
      if (remaining <= 0) {
        return error('QUOTA_EXCEEDED', `Free plan limit of ${FREE_EXTRACT_LIMIT} task extractions per month reached. Upgrade to Pro for unlimited access.`, 402)
      }
    }

    // Extraction first: only mark the email as tracked if the pipeline
    // actually creates or links a task (markActioned inside processEmail).
    // If AI finds nothing actionable, the email is left in its original state
    // so the user can retry or classify it manually.
    if (email.awaitingReview) {
      // Atomic-claim path used by the manual-review modal. Returns the same
      // result shape so the UI can render a single toast.
      const result = await createTaskFromClassifiedEmail(user.id, emailId, 'ai_suggestion')
      if (!result) {
        // Another concurrent click already claimed it; nothing for us to do.
        return success({ created: 0, deduped: 0, noCandidates: false, alreadyClaimed: true })
      }
      const summary = summarizeExtractionResult(result)
      if (summary.created === 0 && summary.deduped === 0) {
        // The atomic claim flipped awaitingReview to false; put it back so the
        // email stays in the review queue exactly as before the click.
        await emailRepo.restoreAwaitingReview(emailId)
      }
      await incrementUsageIfNeeded(user.id, user.plan, summary)
      return success(summary)
    }

    const result = await processEmail(user.id, {
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

    const summary = summarizeExtractionResult(result)
    await incrementUsageIfNeeded(user.id, user.plan, summary)

    return success(summary)
  },
)
