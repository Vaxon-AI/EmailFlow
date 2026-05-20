import { errorFromException, getAuthUser, success, error } from '@/lib/api-helpers'
import * as userPreferenceRepo from '@/repositories/user-preference-repo'
import {
  ONBOARDING_ROLE_OPTIONS,
  ONBOARDING_PURPOSE_OPTIONS,
  ONBOARDING_FOCUS_OPTIONS,
  ONBOARDING_ROLE_LIMIT,
  ONBOARDING_PURPOSE_LIMIT,
  ONBOARDING_FOCUS_LIMIT,
} from '@/lib/onboarding-profile'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getAuthUser()
    const pref = await userPreferenceRepo.findByUserId(user.id)
    if (!pref) return success(null)
    return success({
      roles: pref.roles,
      purposes: pref.purposes,
      focusAreas: pref.focusAreas,
      updatedAt: pref.updatedAt.toISOString(),
    })
  } catch (err) {
    return errorFromException(err, 'LOAD_FAILED', 'Failed to load onboarding profile', 500)
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser()
    const body = await req.json().catch(() => ({}))

    const roles = sanitize(body?.role, ONBOARDING_ROLE_OPTIONS, ONBOARDING_ROLE_LIMIT, 'role')
    if (roles instanceof Response) return roles

    const purposes = sanitize(body?.purpose, ONBOARDING_PURPOSE_OPTIONS, ONBOARDING_PURPOSE_LIMIT, 'purpose')
    if (purposes instanceof Response) return purposes

    const focusAreas = sanitize(body?.focusAreas, ONBOARDING_FOCUS_OPTIONS, ONBOARDING_FOCUS_LIMIT, 'focusAreas')
    if (focusAreas instanceof Response) return focusAreas

    const pref = await userPreferenceRepo.upsert(user.id, { roles, purposes, focusAreas })

    return success({
      roles: pref.roles,
      purposes: pref.purposes,
      focusAreas: pref.focusAreas,
      updatedAt: pref.updatedAt.toISOString(),
    })
  } catch (err) {
    return errorFromException(err, 'UPDATE_FAILED', 'Failed to save onboarding profile', 500)
  }
}

function sanitize(
  raw: unknown,
  allowed: readonly string[],
  limit: number,
  field: string
): string[] | Response {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    return error('INVALID_INPUT', `${field} must be an array`, 400)
  }
  if (raw.length > limit) {
    return error('INVALID_INPUT', `${field} accepts at most ${limit} item(s)`, 400)
  }
  const allowedSet = new Set(allowed)
  const cleaned: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') {
      return error('INVALID_INPUT', `${field} entries must be strings`, 400)
    }
    if (!allowedSet.has(item)) {
      return error('INVALID_INPUT', `${field} contains an unknown value: ${item}`, 400)
    }
    if (seen.has(item)) continue
    seen.add(item)
    cleaned.push(item)
  }
  return cleaned
}
