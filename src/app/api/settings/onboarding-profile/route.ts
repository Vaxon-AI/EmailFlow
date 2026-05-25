import { defineRoute, getAuthUser, parseJsonBody, success } from '@/lib/api-helpers'
import { AppError } from '@/lib/app-errors'
import * as userPreferenceRepo from '@/repositories/user-preference-repo'
import {
  ONBOARDING_ROLE_OPTIONS,
  ONBOARDING_PURPOSE_OPTIONS,
  ONBOARDING_FOCUS_OPTIONS,
  ONBOARDING_ROLE_LIMIT,
  ONBOARDING_PURPOSE_LIMIT,
  ONBOARDING_FOCUS_LIMIT,
} from '@/lib/onboarding-profile'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const onboardingProfileSchema = z.object({
  role: z.unknown().optional(),
  purpose: z.unknown().optional(),
  focusAreas: z.unknown().optional(),
})

export const GET = defineRoute(
  { tag: 'api/settings/onboarding-profile GET', code: 'LOAD_FAILED', message: 'Failed to load onboarding profile' },
  async () => {
    const user = await getAuthUser()
    const pref = await userPreferenceRepo.findByUserId(user.id)
    if (!pref) return success(null)
    return success({
      roles: pref.roles,
      purposes: pref.purposes,
      focusAreas: pref.focusAreas,
      updatedAt: pref.updatedAt.toISOString(),
    })
  },
)

export const POST = defineRoute(
  { tag: 'api/settings/onboarding-profile POST', code: 'UPDATE_FAILED', message: 'Failed to save onboarding profile' },
  async (req: Request) => {
    const user = await getAuthUser()
    const body = await parseJsonBody(req, onboardingProfileSchema, {
      code: 'INVALID_INPUT',
      message: 'Invalid onboarding profile payload',
    })

    const roles = sanitize(body.role, ONBOARDING_ROLE_OPTIONS, ONBOARDING_ROLE_LIMIT, 'role')
    const purposes = sanitize(body.purpose, ONBOARDING_PURPOSE_OPTIONS, ONBOARDING_PURPOSE_LIMIT, 'purpose')
    const focusAreas = sanitize(body.focusAreas, ONBOARDING_FOCUS_OPTIONS, ONBOARDING_FOCUS_LIMIT, 'focusAreas')

    const pref = await userPreferenceRepo.upsert(user.id, { roles, purposes, focusAreas })

    return success({
      roles: pref.roles,
      purposes: pref.purposes,
      focusAreas: pref.focusAreas,
      updatedAt: pref.updatedAt.toISOString(),
    })
  },
)

function sanitize(
  raw: unknown,
  allowed: readonly string[],
  limit: number,
  field: string
): string[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    throw new AppError('INVALID_INPUT', `${field} must be an array`, 400)
  }
  if (raw.length > limit) {
    throw new AppError('INVALID_INPUT', `${field} accepts at most ${limit} item(s)`, 400)
  }
  const allowedSet = new Set(allowed)
  const cleaned: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') {
      throw new AppError('INVALID_INPUT', `${field} entries must be strings`, 400)
    }
    if (!allowedSet.has(item)) {
      throw new AppError('INVALID_INPUT', `${field} contains an unknown value: ${item}`, 400)
    }
    if (seen.has(item)) continue
    seen.add(item)
    cleaned.push(item)
  }
  return cleaned
}
