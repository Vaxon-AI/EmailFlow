export type { EmailProvider, EmailMessage } from './email-provider'
export { gmailProvider } from './gmail'
export { outlookProvider } from './outlook'
export { getEmailProvider, getEnabledEmailProviderKeys, isSupportedEmailProvider } from './provider-registry'

// Future: export { yahooProvider } from './yahoo'
