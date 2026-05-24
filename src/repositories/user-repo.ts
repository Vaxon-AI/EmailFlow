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

export async function setManualReviewMode(userId: string, manualReviewMode: boolean) {
  return prisma.user.update({
    where: { id: userId },
    data: { manualReviewMode },
  })
}

export async function setHasSeenSyncSetup(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { hasSeenSyncSetup: true },
  })
}

export async function setSyncStartDate(userId: string, syncStartDate: Date) {
  return prisma.user.update({
    where: { id: userId },
    data: { syncStartDate },
  })
}

export async function findPasswordHash(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  })
}

export async function setPasswordHash(userId: string, passwordHash: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  })
}

export async function setTotpSecret(userId: string, secret: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { totpEnabled: true, totpSecret: secret },
  })
}

export async function findTotpEnabled(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { totpEnabled: true },
  })
}

export async function disableTotp(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { totpEnabled: false, totpSecret: null },
  })
}

export async function findByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } })
}

export async function findById(userId: string) {
  return prisma.user.findUnique({ where: { id: userId } })
}

export async function findOwnedAccountById(userId: string, accountId: string) {
  return prisma.account.findFirst({
    where: { id: accountId, userId },
    select: { provider: true },
  })
}

export async function createUser(input: {
  email: string
  name: string
  passwordHash: string
  classifyUsed: number
  extractUsed: number
  pasteTextUsed: number
  quotaResetAt: Date
}) {
  return prisma.user.create({ data: input })
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

export async function listSyncReadyAccounts(userId: string) {
  const providerKeys = getEnabledEmailProviderKeys()
  return prisma.account.findMany({
    where: {
      userId,
      provider: { in: providerKeys },
      syncEnabled: true,
      reauthRequired: false,
    },
    select: { id: true, provider: true },
  })
}

export async function findSyncStateFields(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { lastSyncAt: true, syncStartDate: true },
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
