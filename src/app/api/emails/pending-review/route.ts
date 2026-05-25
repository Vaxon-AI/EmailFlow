import { defineRoute, getAuthUser, success } from '@/lib/api-helpers'
import * as emailRepo from '@/repositories/email-repo'

export const GET = defineRoute(
  { tag: 'api/emails/pending-review GET', code: 'FETCH_FAILED', message: 'Failed to fetch pending review emails' },
  async () => {
    const user = await getAuthUser()
    const emails = await emailRepo.findPendingReviewEmails(user.id)
    return success({ emails, count: emails.length })
  },
)
