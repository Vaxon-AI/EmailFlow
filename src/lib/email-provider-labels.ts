export function getEmailProviderLabel(provider?: string | null) {
  switch (provider) {
    case 'google':
    case 'gmail':
      return 'Google'
    case 'microsoft':
    case 'outlook':
      return 'Outlook'
    default:
      return 'Email'
  }
}

export function getEmailProviderAccountLabel(provider?: string | null) {
  return `${getEmailProviderLabel(provider)} account`
}
