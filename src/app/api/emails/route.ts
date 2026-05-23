export const dynamic = "force-dynamic"
import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { getAuthUser, success } from '@/lib/api-helpers'
import * as emailRepo from '@/repositories/email-repo'

const EMPTY_LIST = { success: true, data: [], meta: { page: 1, totalPages: 0, totalCount: 0 } }
const EMAIL_BUCKETS = new Set(['needs_action', 'tracked', 'fyi', 'ignored', 'unclassified'])

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return NextResponse.json(EMPTY_LIST)

    const url = req.nextUrl
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 2000)
    const classification = url.searchParams.get('classification') || undefined
    const bucketParam = url.searchParams.get('bucket') || url.searchParams.get('tab')
    const bucket = bucketParam && EMAIL_BUCKETS.has(bucketParam)
      ? bucketParam as emailRepo.EmailTabBucket
      : undefined

    const { emails, total } = await emailRepo.findEmailsPaginated(user.id, {
      page,
      limit,
      classification,
      bucket,
    })

    return success(emails, {
      page,
      totalPages: Math.ceil(total / limit),
      totalCount: total,
    })
  } catch (err) {
    console.error('[api/emails GET]', err)
    return NextResponse.json(EMPTY_LIST)
  }
}
