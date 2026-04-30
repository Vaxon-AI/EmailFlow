import { getAuthUser, errorFromException } from '@/lib/api-helpers'
import * as emailRepo from '@/repositories/email-repo'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const user = await getAuthUser()
    const emails = await emailRepo.findPendingReviewEmails(user.id)
    return NextResponse.json({ success: true, emails, count: emails.length })
  } catch (err) {
    return errorFromException(err, 'FETCH_FAILED', 'Failed to fetch pending review emails', 500)
  }
}
