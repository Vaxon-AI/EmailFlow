import { describe, expect, it } from 'vitest'
import { shouldShowQuotaWarning } from '../sync-quota-warning'

describe('shouldShowQuotaWarning', () => {
  it('does not show while more than 10% of free quota remains', () => {
    expect(shouldShowQuotaWarning(11, 100)).toBe(false)
  })

  it('shows at exactly 10% remaining', () => {
    expect(shouldShowQuotaWarning(10, 100)).toBe(true)
  })

  it('shows when quota is exhausted', () => {
    expect(shouldShowQuotaWarning(0, 100)).toBe(true)
  })

  it('does not show for pro/null quota responses', () => {
    expect(shouldShowQuotaWarning(null, null)).toBe(false)
  })
})
