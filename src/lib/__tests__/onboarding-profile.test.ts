import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ONBOARDING_FOCUS_LIMIT,
  ONBOARDING_PROFILE_STORAGE_KEY,
  ONBOARDING_PURPOSE_LIMIT,
  ONBOARDING_ROLE_LIMIT,
  clearLocalStorageProfile,
  migrateLocalStorageIfPresent,
  toggleChipValue,
} from '../onboarding-profile'

describe('toggleChipValue', () => {
  it('adds a new value when under the limit', () => {
    expect(toggleChipValue([], 'Student', 2)).toEqual(['Student'])
    expect(toggleChipValue(['Student'], 'Professional', 2)).toEqual(['Student', 'Professional'])
  })

  it('removes a value that is already present (toggle off)', () => {
    expect(toggleChipValue(['Student', 'Professional'], 'Student', 2)).toEqual(['Professional'])
  })

  it('keeps the existing selection unchanged when at capacity — caller must deselect first', () => {
    const at = ['Student', 'Professional']
    expect(toggleChipValue(at, 'Manager', 2)).toBe(at)
  })

  it('still allows toggling OFF when at capacity (deselect is always allowed)', () => {
    expect(toggleChipValue(['Student', 'Professional'], 'Student', 2)).toEqual(['Professional'])
  })

  it('matches the documented limits exposed alongside the helper', () => {
    expect(ONBOARDING_ROLE_LIMIT).toBe(2)
    expect(ONBOARDING_PURPOSE_LIMIT).toBe(2)
    expect(ONBOARDING_FOCUS_LIMIT).toBe(5)
  })
})

describe('migrateLocalStorageIfPresent / clearLocalStorageProfile', () => {
  const originalWindow = (globalThis as { window?: unknown }).window

  function installFakeStorage(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial))
    const storage = {
      getItem: vi.fn((key: string) => (store.has(key) ? store.get(key)! : null)),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value)
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key)
      }),
    }
    ;(globalThis as { window?: unknown }).window = { localStorage: storage }
    return storage
  }

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window
    } else {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
  })

  it('returns null in a non-browser environment', () => {
    delete (globalThis as { window?: unknown }).window
    expect(migrateLocalStorageIfPresent()).toBeNull()
  })

  it('returns null when nothing is stored', () => {
    installFakeStorage()
    expect(migrateLocalStorageIfPresent()).toBeNull()
  })

  it('parses a well-formed legacy payload', () => {
    installFakeStorage({
      [ONBOARDING_PROFILE_STORAGE_KEY]: JSON.stringify({
        role: ['Student'],
        purpose: ['Study'],
        focusAreas: ['Deadlines', 'Meetings'],
      }),
    })
    expect(migrateLocalStorageIfPresent()).toEqual({
      role: ['Student'],
      purpose: ['Study'],
      focusAreas: ['Deadlines', 'Meetings'],
    })
  })

  it('returns null when the legacy payload has only empty arrays — nothing worth migrating', () => {
    installFakeStorage({
      [ONBOARDING_PROFILE_STORAGE_KEY]: JSON.stringify({ role: [], purpose: [], focusAreas: [] }),
    })
    expect(migrateLocalStorageIfPresent()).toBeNull()
  })

  it('filters out non-string entries from a partially-corrupt payload', () => {
    installFakeStorage({
      [ONBOARDING_PROFILE_STORAGE_KEY]: JSON.stringify({
        role: ['Student', 42, null],
        purpose: [{ bad: true }, 'Study'],
        focusAreas: 'not-an-array',
      }),
    })
    expect(migrateLocalStorageIfPresent()).toEqual({
      role: ['Student'],
      purpose: ['Study'],
      focusAreas: [],
    })
  })

  it('returns null for unparseable JSON instead of throwing', () => {
    installFakeStorage({ [ONBOARDING_PROFILE_STORAGE_KEY]: 'not json {' })
    expect(migrateLocalStorageIfPresent()).toBeNull()
  })

  it('clearLocalStorageProfile removes the legacy key', () => {
    const storage = installFakeStorage({
      [ONBOARDING_PROFILE_STORAGE_KEY]: JSON.stringify({ role: ['Student'], purpose: [], focusAreas: [] }),
    })
    clearLocalStorageProfile()
    expect(storage.removeItem).toHaveBeenCalledWith(ONBOARDING_PROFILE_STORAGE_KEY)
    expect(storage.getItem(ONBOARDING_PROFILE_STORAGE_KEY)).toBeNull()
  })

  it('clearLocalStorageProfile is a no-op in non-browser environments', () => {
    delete (globalThis as { window?: unknown }).window
    expect(() => clearLocalStorageProfile()).not.toThrow()
  })

  it('clearLocalStorageProfile swallows storage exceptions', () => {
    ;(globalThis as { window?: unknown }).window = {
      localStorage: {
        removeItem: () => {
          throw new Error('quota exceeded')
        },
      },
    }
    expect(() => clearLocalStorageProfile()).not.toThrow()
  })
})

// Suppress an unused-import lint warning for beforeEach in case other helpers
// need it in the future.
beforeEach(() => {})
