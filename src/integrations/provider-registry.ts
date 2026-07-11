import { AppError } from '@/lib/app-errors'
import type { EmailProvider } from './email-provider'
import { gmailProvider } from './gmail'
import { outlookProvider } from './outlook'

const providersByAccountKey = new Map<string, EmailProvider>([
  [gmailProvider.accountProvider, gmailProvider],
  [outlookProvider.accountProvider, outlookProvider],
])

export function getEmailProvider(providerKey: string): EmailProvider {
  const provider = providersByAccountKey.get(providerKey)
  if (!provider) {
    throw new AppError('SYNC_FAILED', `Unsupported email provider: ${providerKey}`, 400)
  }
  return provider
}

export function getEnabledEmailProviderKeys(): string[] {
  return Array.from(providersByAccountKey.keys())
}

export function isSupportedEmailProvider(providerKey: string): boolean {
  return providersByAccountKey.has(providerKey)
}
