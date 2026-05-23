import { prisma } from '@/lib/prisma'
import { getEnabledEmailProviderKeys } from '@/integrations/provider-registry'

// ============================================================
// User Repository — all user database operations
// ============================================================

export async function updateLastSync(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { lastSyncAt: new Date() },
  })
}

export async function updateAccountLastSync(accountId: string) {
  return prisma.account.update({
    where: { id: accountId },
    data: { lastSyncAt: new Date(), reauthRequired: false, reauthReason: null, reauthAt: null, reauthProvider: null },
  })
}

export async function getUserSyncInfo(userId: string) {
  const providerKeys = getEnabledEmailProviderKeys()
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      lastSyncAt: true,
      syncEnabled: true,
      manualReviewMode: true,
      emailProviderReauthRequired: true,
      emailProviderReauthReason: true,
      emailProviderReauthAt: true,
      emailProviderReauthProvider: true,
      accounts: {
        where: { provider: { in: providerKeys }, syncEnabled: true },
        select: { id: true },
        take: 1,
      },
    },
  })
  if (!user) return null
  const { accounts, ...syncInfo } = user
  return { ...syncInfo, emailConnected: accounts.length > 0 }
}

export async function listEnabledEmailAccounts(userId: string) {
  const providerKeys = getEnabledEmailProviderKeys()
  return prisma.account.findMany({
    where: { userId, provider: { in: providerKeys }, syncEnabled: true },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      provider: true,
      email: true,
      syncEnabled: true,
      reauthRequired: true,
      reauthReason: true,
      reauthAt: true,
      reauthProvider: true,
      lastSyncAt: true,
    },
  })
}
