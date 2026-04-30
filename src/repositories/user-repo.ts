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
