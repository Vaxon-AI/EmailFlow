export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { defineRoute, getAuthUser, success } from '@/lib/api-helpers'
import { createDailyDigest, createWeeklyDigest, previewDigest } from '@/workflows/digest-pipeline'
import * as digestRepo from '@/repositories/digest-repo'

// GET /api/digest — get latest digests
export const GET = defineRoute(
  { tag: 'api/digest GET', code: 'DIGEST_FAILED', message: 'Failed to load digests' },
  async (req: NextRequest) => {
    const user = await getAuthUser()

    const url = req.nextUrl
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '10')
    const currentPeriod = url.searchParams.get('current')

    const { digests, total } = await digestRepo.findDigestsPaginated(user.id, { page, limit })
    const data = currentPeriod === 'daily' || currentPeriod === 'weekly'
      ? [await previewDigest(user.id, currentPeriod), ...digests]
      : digests

    return success(data, {
      page,
      totalPages: Math.ceil(total / limit),
      totalCount: total,
    })
  },
)

// POST /api/digest — generate a new digest
// Body: { period?: 'daily' | 'weekly' }  — defaults to 'daily'
export const POST = defineRoute(
  { tag: 'api/digest POST', code: 'DIGEST_FAILED', message: 'Failed to generate digest' },
  async (req: NextRequest) => {
    const user = await getAuthUser()

    const body = await req.json().catch(() => ({}))
    const period = body.period === 'weekly' ? 'weekly' : 'daily'

    const digest = period === 'weekly'
      ? await createWeeklyDigest(user.id)
      : await createDailyDigest(user.id)

    return success(digest)
  },
)
