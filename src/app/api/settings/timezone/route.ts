import { defineRoute, error, getAuthUser, parseJsonBody, success } from '@/lib/api-helpers'
import { isValidTimezone } from '@/lib/timezone'
import { updateTimezone } from '@/repositories/user-repo'
import { z } from 'zod'

const timezoneSchema = z.object({
  timezone: z.unknown().refine(
    (value): value is string => typeof value === 'string' && value.length > 0,
    'Missing timezone',
  ),
})

export const POST = defineRoute(
  { tag: 'api/settings/timezone POST', code: 'UPDATE_FAILED', message: 'Failed to update timezone' },
  async (req: Request) => {
    const user = await getAuthUser()
    const { timezone } = await parseJsonBody(req, timezoneSchema, {
      code: 'INVALID_INPUT',
    })

    if (!isValidTimezone(timezone)) {
      return error('INVALID_TIMEZONE', `Unknown timezone: ${timezone}`, 400)
    }

    await updateTimezone(user.id, timezone)

    return success({ timezone })
  },
)
