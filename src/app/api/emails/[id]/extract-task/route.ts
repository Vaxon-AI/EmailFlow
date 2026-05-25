import { defineRoute, error, getAuthUser, success } from '@/lib/api-helpers'
import * as emailRepo from '@/repositories/email-repo'
import { createTaskFromClassifiedEmail, processEmail } from '@/workflows'

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

    // The click itself is the user's intent to track this email; the bucket move
    // happens up-front and is independent of whether the AI ends up creating a
    // new task, deduping into an existing one, or finding nothing actionable.
    await emailRepo.setEmailBucket(emailId, 'tracked')

    if (email.awaitingReview) {
      // Atomic-claim path used by the manual-review modal. Returns the same
      // result shape so the UI can render a single toast.
      const result = await createTaskFromClassifiedEmail(user.id, emailId, 'ai_suggestion')
      if (!result) {
        // Another concurrent click already claimed it; nothing for us to do.
        return success({ created: 0, deduped: 0, noCandidates: false, alreadyClaimed: true })
      }
      return success({
        created: result.createdTaskIds?.length ?? 0,
        deduped: result.dedupedTaskIds?.length ?? 0,
        noCandidates: result.noCandidates ?? false,
      })
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

    return success({
      created: result.createdTaskIds?.length ?? 0,
      deduped: result.dedupedTaskIds?.length ?? 0,
      noCandidates: result.noCandidates ?? false,
    })
  },
)
