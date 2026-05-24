const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  gmail: 'Google',
  microsoft: 'Outlook',
  outlook: 'Outlook',
}

export function getEmailProviderLabel(provider?: string | null) {
  if (!provider) return 'Email'
  return PROVIDER_LABELS[provider] ?? 'Email'
}

export function getEmailProviderAccountLabel(provider?: string | null) {
  return `${getEmailProviderLabel(provider)} account`
}
