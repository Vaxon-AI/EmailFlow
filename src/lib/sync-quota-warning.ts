export function shouldShowQuotaWarning(quotaRemaining?: number | null, quotaLimit?: number | null) {
  if (quotaRemaining == null) return false
  if (quotaRemaining === 0) return true
  if (!quotaLimit) return false
  return quotaRemaining / quotaLimit <= 0.1
}
