import { describe, expect, it } from 'vitest'

import { shouldShowQuotaWarning } from '../sync-quota-warning'

// Extends sync-quota-warning.test.ts with edge cases around the 10% threshold
// boundary and null-input handling not covered by the original file.
describe('shouldShowQuotaWarning — boundary and null handling', () => {
  it('warns when remaining is exactly 0 even without a known limit', () => {
    expect(shouldShowQuotaWarning(0, null)).toBe(true)
    expect(shouldShowQuotaWarning(0, undefined)).toBe(true)
    expect(shouldShowQuotaWarning(0, 100)).toBe(true)
  })

  it('returns false when remaining is null/undefined regardless of limit', () => {
    expect(shouldShowQuotaWarning(null, 100)).toBe(false)
    expect(shouldShowQuotaWarning(undefined, 100)).toBe(false)
    expect(shouldShowQuotaWarning(null, null)).toBe(false)
  })

  it('does not warn when remaining > 0 but limit is unknown', () => {
    expect(shouldShowQuotaWarning(5, null)).toBe(false)
    expect(shouldShowQuotaWarning(5, undefined)).toBe(false)
    expect(shouldShowQuotaWarning(5, 0)).toBe(false)
  })

  it('warns at the 10% threshold (inclusive)', () => {
    expect(shouldShowQuotaWarning(10, 100)).toBe(true)
    expect(shouldShowQuotaWarning(1, 10)).toBe(true)
  })

  it('does not warn just above the 10% threshold', () => {
    expect(shouldShowQuotaWarning(11, 100)).toBe(false)
    expect(shouldShowQuotaWarning(50, 100)).toBe(false)
  })
})
