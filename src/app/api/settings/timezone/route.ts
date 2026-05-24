import { errorFromException, getAuthUser, success, error, parseJsonBody } from '@/lib/api-helpers'
import { isValidTimezone } from '@/lib/timezone'
import { updateTimezone } from '@/repositories/user-repo'
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

    if (!isValidTimezone(timezone)) {
      return error('INVALID_TIMEZONE', `Unknown timezone: ${timezone}`, 400)
    }

    await updateTimezone(user.id, timezone)

    return success({ timezone })
  } catch (err) {
    return errorFromException(err, 'UPDATE_FAILED', 'Failed to update timezone', 500)
  }
}
