// Shared definitions for the onboarding personalisation profile.
// Consumed by the first-login modal (dashboard) and the Settings → Account
// card (where users can fill in or update preferences after skipping).

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
  savedAt: string
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

export function loadOnboardingProfile(): OnboardingProfile | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ONBOARDING_PROFILE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<OnboardingProfile>
    return {
      role: Array.isArray(parsed.role) ? parsed.role : [],
      purpose: Array.isArray(parsed.purpose) ? parsed.purpose : [],
      focusAreas: Array.isArray(parsed.focusAreas) ? parsed.focusAreas : [],
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function saveOnboardingProfile(profile: Omit<OnboardingProfile, 'savedAt'>): OnboardingProfile | null {
  if (typeof window === 'undefined') return null
  const stamped: OnboardingProfile = { ...profile, savedAt: new Date().toISOString() }
  try {
    window.localStorage.setItem(ONBOARDING_PROFILE_STORAGE_KEY, JSON.stringify(stamped))
    cachedSnapshot = stamped
    notifyOnboardingProfileChanged()
    return stamped
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// useSyncExternalStore plumbing
//
// React's useSyncExternalStore demands two stable functions: a subscribe()
// that wires in a change listener, and a snapshot getter that must return a
// referentially-stable value while nothing has changed. We back the snapshot
// with a module-level cache so repeated reads during a render don't allocate
// fresh objects (which would cause infinite render loops).
// ─────────────────────────────────────────────────────────────────────────────

let cachedSnapshot: OnboardingProfile | null = null
let cacheInitialized = false
const listeners = new Set<() => void>()

export function subscribeOnboardingProfile(listener: () => void): () => void {
  listeners.add(listener)
  // Reflect cross-tab edits — `storage` only fires in OTHER tabs, so the
  // local save path triggers notify() directly above.
  const onStorage = (event: StorageEvent) => {
    if (event.key && event.key !== ONBOARDING_PROFILE_STORAGE_KEY) return
    cacheInitialized = false
    listener()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage)
  }
  return () => {
    listeners.delete(listener)
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage)
    }
  }
}

export function getOnboardingProfileSnapshot(): OnboardingProfile | null {
  if (!cacheInitialized) {
    cachedSnapshot = loadOnboardingProfile()
    cacheInitialized = true
  }
  return cachedSnapshot
}

// Server snapshot is always null — no localStorage on the server, so the
// initial SSR render shows the empty state, and the client swaps in the real
// profile once it hydrates.
export function getServerOnboardingProfileSnapshot(): OnboardingProfile | null {
  return null
}

export function notifyOnboardingProfileChanged() {
  for (const listener of listeners) listener()
}
