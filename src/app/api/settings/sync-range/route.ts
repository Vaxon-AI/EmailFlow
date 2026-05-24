import { errorFromException, getAuthUser, success, error, parseJsonBody } from '@/lib/api-helpers'
import { setSyncStartDate } from '@/repositories/user-repo'
import { z } from 'zod'

const syncRangeSchema = z.object({
  days: z.number({ message: 'days must be an integer between 1 and 365' })
    .int('days must be an integer between 1 and 365')
    .min(1, 'days must be an integer between 1 and 365')
    .max(365, 'days must be an integer between 1 and 365')
    .optional(),
  customDate: z.string({ message: 'customDate must be an ISO 8601 string' }).optional(),
})

export async function POST(req: Request) {
  try {
    const user = await getAuthUser()
    const { days, customDate } = await parseJsonBody(req, syncRangeSchema, {
      code: 'INVALID_INPUT',
    })

    const hasDays = days !== undefined && days !== null
    const hasCustom = customDate !== undefined && customDate !== null

    if (hasDays && hasCustom) {
      return error('INVALID_INPUT', 'Provide either days or customDate, not both', 400)
    }
    if (!hasDays && !hasCustom) {
      return error('INVALID_INPUT', 'Missing days or customDate', 400)
    }

    let startDate: Date
    if (hasCustom) {
      startDate = new Date(customDate)
      if (Number.isNaN(startDate.getTime())) {
        return error('INVALID_INPUT', 'customDate must be a valid ISO 8601 date', 400)
      }
      if (startDate.getTime() > Date.now()) {
        return error('INVALID_INPUT', 'customDate must be in the past', 400)
      }
    } else {
      const lookbackDays = days
      if (lookbackDays === undefined) {
        return error('INVALID_INPUT', 'Missing days or customDate', 400)
      }
      startDate = new Date()
      startDate.setDate(startDate.getDate() - lookbackDays)
    }

    await setSyncStartDate(user.id, startDate)

    return success({ syncStartDate: startDate })
  } catch (err) {
    return errorFromException(err, 'UPDATE_FAILED', 'Failed to update sync range', 500)
  }
}
