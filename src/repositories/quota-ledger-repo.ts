import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

// ============================================================
// Quota Ledger Repository
//
// Persists per-identifier (registration email + Gmail OAuth email) quota
// usage so that deleting an account and re-registering with the same
// email does not reset the free-tier limits in src/lib/quota.ts.
// Records survive User deletion — no FK to User.
// ============================================================

export type IdentifierType = 'email' | 'gmail'

export interface InheritedQuota {
  classifyUsed: number
  extractUsed: number
  pasteTextUsed: number
  quotaResetAt: Date
}

type DbClient = Prisma.TransactionClient | typeof prisma

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function mergeQuota(a: InheritedQuota, b: InheritedQuota): InheritedQuota {
  // used: max (stricter). quotaResetAt: earlier (shorter remaining window).
  return {
    classifyUsed: Math.max(a.classifyUsed, b.classifyUsed),
    extractUsed: Math.max(a.extractUsed, b.extractUsed),
    pasteTextUsed: Math.max(a.pasteTextUsed, b.pasteTextUsed),
    quotaResetAt: a.quotaResetAt < b.quotaResetAt ? a.quotaResetAt : b.quotaResetAt,
  }
}

async function upsertOne(
  db: DbClient,
  identifierType: IdentifierType,
  identifier: string,
  current: InheritedQuota,
): Promise<void> {
  const normalized = normalize(identifier)
  const existing = await db.quotaLedger.findUnique({
    where: { identifierType_identifier: { identifierType, identifier: normalized } },
  })

  if (!existing) {
    await db.quotaLedger.create({
      data: { identifierType, identifier: normalized, ...current },
    })
    return
  }

  const merged = mergeQuota(current, existing)
  await db.quotaLedger.update({
    where: { identifierType_identifier: { identifierType, identifier: normalized } },
    data: merged,
  })
}

/**
 * Snapshot a user's current quota usage into the ledger, one record per
 * identifier (registration email + each bound Gmail OAuth email). Call this
 * inside the same transaction as user.delete() so the snapshot is atomic
 * with the cascade delete.
 */
export async function snapshotForUser(userId: string, db: DbClient = prisma): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      classifyUsed: true,
      extractUsed: true,
      pasteTextUsed: true,
      quotaResetAt: true,
      accounts: {
        where: { provider: 'google' },
        select: { email: true },
      },
    },
  })

  if (!user) return

  const current: InheritedQuota = {
    classifyUsed: user.classifyUsed,
    extractUsed: user.extractUsed,
    pasteTextUsed: user.pasteTextUsed,
    quotaResetAt: user.quotaResetAt,
  }

  await upsertOne(db, 'email', user.email, current)

  for (const account of user.accounts) {
    if (account.email) {
      await upsertOne(db, 'gmail', account.email, current)
    }
  }
}

/**
 * Look up inherited quota for a registration email or Gmail OAuth email.
 * If records exist under both types for the same address, merge them.
 * Returns zero-initialized values when no record exists.
 *
 * Note: maybeResetQuota in src/lib/quota.ts handles the 30-day window —
 * if quotaResetAt is older than 30 days, the user's quota gets reset to 0
 * on their first quota check. So inheriting a long-ago quotaResetAt is
 * safe and gives the desired "strict within window, normal reset after" behavior.
 */
export async function getInheritedQuotaForEmail(
  email: string,
  type: IdentifierType,
): Promise<InheritedQuota> {
  const normalized = normalize(email)
  const record = await prisma.quotaLedger.findUnique({
    where: { identifierType_identifier: { identifierType: type, identifier: normalized } },
  })

  // Also check the other type — a user may have registered with email X and
  // separately OAuthed Gmail X. Both records should constrain the new account.
  const otherType: IdentifierType = type === 'email' ? 'gmail' : 'email'
  const otherRecord = await prisma.quotaLedger.findUnique({
    where: { identifierType_identifier: { identifierType: otherType, identifier: normalized } },
  })

  const zero: InheritedQuota = {
    classifyUsed: 0,
    extractUsed: 0,
    pasteTextUsed: 0,
    quotaResetAt: new Date(),
  }

  if (!record && !otherRecord) return zero
  if (record && !otherRecord) {
    return {
      classifyUsed: record.classifyUsed,
      extractUsed: record.extractUsed,
      pasteTextUsed: record.pasteTextUsed,
      quotaResetAt: record.quotaResetAt,
    }
  }
  if (!record && otherRecord) {
    return {
      classifyUsed: otherRecord.classifyUsed,
      extractUsed: otherRecord.extractUsed,
      pasteTextUsed: otherRecord.pasteTextUsed,
      quotaResetAt: otherRecord.quotaResetAt,
    }
  }
  return mergeQuota(
    {
      classifyUsed: record!.classifyUsed,
      extractUsed: record!.extractUsed,
      pasteTextUsed: record!.pasteTextUsed,
      quotaResetAt: record!.quotaResetAt,
    },
    {
      classifyUsed: otherRecord!.classifyUsed,
      extractUsed: otherRecord!.extractUsed,
      pasteTextUsed: otherRecord!.pasteTextUsed,
      quotaResetAt: otherRecord!.quotaResetAt,
    },
  )
}

/**
 * When an already-logged-in user binds a Gmail account, merge any existing
 * gmail-type ledger entry for that address into the user's quota. Prevents
 * a user from circumventing the limit by registering a fresh email account
 * and then attaching a previously-tracked Gmail address.
 *
 * Take max(used) and earlier(quotaResetAt) — same rule as the snapshot merge.
 */
export async function mergeGmailLedgerIntoUser(
  userId: string,
  gmailEmail: string,
  db: DbClient = prisma,
): Promise<void> {
  const normalized = normalize(gmailEmail)
  const ledger = await db.quotaLedger.findUnique({
    where: { identifierType_identifier: { identifierType: 'gmail', identifier: normalized } },
  })
  if (!ledger) return

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      classifyUsed: true,
      extractUsed: true,
      pasteTextUsed: true,
      quotaResetAt: true,
    },
  })
  if (!user) return

  const merged = mergeQuota(user, ledger)
  if (
    merged.classifyUsed === user.classifyUsed &&
    merged.extractUsed === user.extractUsed &&
    merged.pasteTextUsed === user.pasteTextUsed &&
    merged.quotaResetAt.getTime() === user.quotaResetAt.getTime()
  ) {
    return
  }
  await db.user.update({ where: { id: userId }, data: merged })
}
