function hasUnknownQuotaLimit(quotaLimit?: number | null) {
  return !quotaLimit
}

function quotaRemainingRatio(quotaRemaining: number, quotaLimit: number) {
  return quotaRemaining / quotaLimit
}

export function shouldShowQuotaWarning(quotaRemaining?: number | null, quotaLimit?: number | null) {
  if (quotaRemaining == null) return false
  if (quotaRemaining === 0) return true
  if (hasUnknownQuotaLimit(quotaLimit)) return false
  return quotaRemainingRatio(quotaRemaining, quotaLimit) <= 0.1
}
