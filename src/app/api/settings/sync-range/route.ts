import { errorFromException, getAuthUser, success, error } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const user = await getAuthUser()
    const body = await req.json().catch(() => ({}))
    const { days, customDate } = body as { days?: unknown; customDate?: unknown }

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
      if (typeof customDate !== 'string') {
        return error('INVALID_INPUT', 'customDate must be an ISO 8601 string', 400)
      }
      startDate = new Date(customDate)
      if (Number.isNaN(startDate.getTime())) {
        return error('INVALID_INPUT', 'customDate must be a valid ISO 8601 date', 400)
      }
      if (startDate.getTime() > Date.now()) {
        return error('INVALID_INPUT', 'customDate must be in the past', 400)
      }
    } else {
      if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 365) {
        return error('INVALID_INPUT', 'days must be an integer between 1 and 365', 400)
      }
      startDate = new Date()
      startDate.setDate(startDate.getDate() - days)
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { syncStartDate: startDate },
    })

    return success({ syncStartDate: startDate })
  } catch (err) {
    return errorFromException(err, 'UPDATE_FAILED', 'Failed to update sync range', 500)
  }
}
