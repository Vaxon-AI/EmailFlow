// Shared definitions for the onboarding personalisation profile.
// Persisted server-side via /api/settings/onboarding-profile; this file holds
// the option catalogues, limits, and a one-shot migration helper for legacy
// localStorage data written before the backend existed.

export const ONBOARDING_PROFILE_STORAGE_KEY = 'emailflow.onboarding.profile'

export const ONBOARDING_ROLE_OPTIONS = [
  'Student',
  'Professional',
  'Manager',
  'Business Owner',
  'Freelancer',
  'Job Seeker',
  'Researcher',
  'Academic',
] as const

export const ONBOARDING_PURPOSE_OPTIONS = [
  'Work',
  'Study',
  'Job Search',
  'Personal Admin',
  'Research',
  'Side Project',
  'Client Work',
  'Mixed Use',
] as const

export const ONBOARDING_FOCUS_OPTIONS = [
  'Deadlines',
  'Follow-ups',
  'Meetings',
  'Applications',
  'Forms',
  'Approvals',
  'Decisions',
  'Invoices',
  'Payments',
  'Client Requests',
  'Reports',
  'Documents',
  'Study Tasks',
  'Admin Tasks',
  'Important Replies',
  'Events',
] as const

export const ONBOARDING_ROLE_LIMIT = 2
export const ONBOARDING_PURPOSE_LIMIT = 2
export const ONBOARDING_FOCUS_LIMIT = 5

export type OnboardingProfile = {
  role: string[]
  purpose: string[]
  focusAreas: string[]
}

// Toggle a value in/out of a multi-select chip group, capped at `limit`.
// Returning unchanged state at capacity (rather than dropping the oldest pick)
// keeps the user's prior selections stable — they have to deselect before
// adding a new one.
export function toggleChipValue(current: string[], value: string, limit: number): string[] {
  if (current.includes(value)) return current.filter((v) => v !== value)
  if (current.length >= limit) return current
  return [...current, value]
}

// One-shot migration: when the dashboard first loads against the server-backed
// profile API, callers should check legacy localStorage and POST it up if the
// server returns null. We only READ here — the caller decides when to delete
// the localStorage entry (after a successful POST).
export function migrateLocalStorageIfPresent(): OnboardingProfile | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ONBOARDING_PROFILE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<OnboardingProfile>
    const role = Array.isArray(parsed.role) ? parsed.role.filter((v): v is string => typeof v === 'string') : []
    const purpose = Array.isArray(parsed.purpose) ? parsed.purpose.filter((v): v is string => typeof v === 'string') : []
    const focusAreas = Array.isArray(parsed.focusAreas) ? parsed.focusAreas.filter((v): v is string => typeof v === 'string') : []
    if (role.length === 0 && purpose.length === 0 && focusAreas.length === 0) return null
    return { role, purpose, focusAreas }
  } catch {
    return null
  }
}

export function clearLocalStorageProfile(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(ONBOARDING_PROFILE_STORAGE_KEY)
  } catch {
    // ignore — storage may be unavailable
  }
}
