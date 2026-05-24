import { prisma } from '@/lib/prisma'

export type EmailProviderName = 'gmail' | 'outlook'
export type ProviderReauthReason =
  | 'access_token_invalid'
  | 'invalid_grant'
  | 'missing_refresh_token'
  | 'refresh_failed'
  | 'revoked'

function buildProviderReauthData(
  provider: EmailProviderName,
  required: boolean,
  reason: ProviderReauthReason | null,
) {
  return {
    emailProviderReauthRequired: required,
    emailProviderReauthReason: reason,
    emailProviderReauthAt: required ? new Date() : null,
    emailProviderReauthProvider: provider,
  }
}

export async function markProviderReauthRequired(
  userId: string,
  provider: EmailProviderName,
  reason: ProviderReauthReason,
) {
  return prisma.user.update({
    where: { id: userId },
    data: buildProviderReauthData(provider, true, reason),
  })
}

export async function clearProviderReauthRequired(userId: string, provider: EmailProviderName) {
  return prisma.user.update({
    where: { id: userId },
    data: buildProviderReauthData(provider, false, null),
  })
}
