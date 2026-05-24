import { errorFromException, getAuthUser, success, error, parseJsonBody } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const timezoneSchema = z.object({
  timezone: z.unknown().refine(
    (value): value is string => typeof value === 'string' && value.length > 0,
    'Missing timezone',
  ),
})

export async function POST(req: Request) {
  try {
    const user = await getAuthUser()
    const { timezone } = await parseJsonBody(req, timezoneSchema, {
      code: 'INVALID_INPUT',
    })

    // Validate that it's a real IANA timezone string
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone })
    } catch {
      return error('INVALID_TIMEZONE', `Unknown timezone: ${timezone}`, 400)
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { timezone },
    })

    return success({ timezone })
  } catch (err) {
    return errorFromException(err, 'UPDATE_FAILED', 'Failed to update timezone', 500)
  }
}
