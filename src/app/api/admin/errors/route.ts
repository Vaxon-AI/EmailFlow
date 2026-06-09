import { defineRoute, error, getAuthUser, success } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export const GET = defineRoute(
  { tag: 'api/admin/errors GET', code: 'FETCH_FAILED', message: 'Failed to fetch error logs' },
  async () => {
    const user = await getAuthUser()
    if (!user.isAdmin) return error('FORBIDDEN', 'Admin access required', 403)

    const logs = await prisma.errorLog.findMany({
      select: {
        id: true,
        userId: true,
        action: true,
        error: true,
        stack: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return success(logs)
  },
)
