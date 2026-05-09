import { getAuthUser, errorFromException, success } from '@/lib/api-helpers'
import * as emailRepo from '@/repositories/email-repo'

export async function GET() {
  try {
    const user = await getAuthUser()
    const emails = await emailRepo.findPendingReviewEmails(user.id)
    return success({ emails, count: emails.length })
  } catch (err) {
    return errorFromException(err, 'FETCH_FAILED', 'Failed to fetch pending review emails', 500)
  }
}
