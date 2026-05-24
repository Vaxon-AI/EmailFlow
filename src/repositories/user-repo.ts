import { prisma } from '@/lib/prisma'
import { getEnabledEmailProviderKeys } from '@/integrations/provider-registry'
import { snapshotForUser } from '@/repositories/quota-ledger-repo'

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

const SYNC_ENABLED_WHERE = {
  accounts: { some: { provider: 'google', syncEnabled: true } },
}

export async function findSyncEnabledUserIds() {
  return prisma.user.findMany({
    where: SYNC_ENABLED_WHERE,
    select: { id: true },
  })
}

export async function findSyncEnabledUsersWithTimezone() {
  return prisma.user.findMany({
    where: SYNC_ENABLED_WHERE,
    select: { id: true, email: true, timezone: true },
  })
}

export async function updateTimezone(userId: string, timezone: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { timezone },
  })
}

export async function findForTotpVerify(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      totpEnabled: true,
      totpSecret: true,
    },
  })
}

export async function findFullProfile(userId: string) {
  const [user, googleAccounts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        isAdmin: true,
        syncStartDate: true,
        timezone: true,
        totpEnabled: true,
        manualReviewMode: true,
        emailProviderReauthRequired: true,
        emailProviderReauthReason: true,
        emailProviderReauthAt: true,
        emailProviderReauthProvider: true,
      },
    }),
    prisma.account.findMany({
      where: { userId, provider: 'google' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        provider: true,
        email: true,
        syncEnabled: true,
        lastSyncAt: true,
        reauthRequired: true,
        reauthReason: true,
        reauthAt: true,
        reauthProvider: true,
      },
    }),
  ])

  if (!user) return null
  return { user, googleAccounts }
}

export async function deleteUserWithQuotaSnapshot(userId: string) {
  return prisma.$transaction(async (tx) => {
    await snapshotForUser(userId, tx)
    await tx.user.delete({ where: { id: userId } })
  })
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
