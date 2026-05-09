import { prisma } from '@/lib/prisma'

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
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      lastSyncAt: true,
      gmailConnected: true,
      syncEnabled: true,
      manualReviewMode: true,
      emailProviderReauthRequired: true,
      emailProviderReauthReason: true,
      emailProviderReauthAt: true,
      emailProviderReauthProvider: true,
    },
  })
}

export async function listEnabledGmailAccounts(userId: string) {
  return prisma.account.findMany({
    where: { userId, provider: 'google', syncEnabled: true },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
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
