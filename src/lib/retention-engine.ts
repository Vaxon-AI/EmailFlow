/**
 * Retention Engine
 *
 * Pure functions — no DB access, no side effects.
 * Given an email snapshot + policy + protection rules, determines what
 * retention action (if any) should be applied.
 *
 * State machine:
 *   General emails:  ACTIVE → METADATA_ONLY → PURGED
 *   Task-done emails: ACTIVE → ARCHIVED → METADATA_ONLY → PURGED
 *
 * A single matching protection rule keeps an email at ACTIVE forever.
 */

import { addDays, differenceInDays } from 'date-fns'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type RetentionStatus = 'ACTIVE' | 'ARCHIVED' | 'METADATA_ONLY' | 'PURGED'
export type ProtectionRuleType = 'CONTACT' | 'DOMAIN' | 'LABEL'

/**
 * Minimal projection of an Email row needed by the engine.
 * completedTaskAt: the earliest completedAt across all tasks linked to this
 * email that have status='completed'. null if none.
 */
export type EmailSnapshot = {
  id: string
  retentionStatus: RetentionStatus
  receivedAt: Date
  sender: string
  labels: string            // JSON array string, e.g. '["INBOX","STARRED"]'
  archivedAt: Date | null
  metadataOnlyAt: Date | null
  restorableUntil: Date | null
  completedTaskAt: Date | null
}

export type PolicySnapshot = {
  /** Days from receivedAt before a general email becomes METADATA_ONLY (default 30) */
  metadataOnlyAfterDays: number
  /** Days from receivedAt before a general email is PURGED (default 90) */
  purgeAfterDays: number
  /** Days from task.completedAt before the email is ARCHIVED (default 0 = immediate) */
  taskDoneArchiveAfterDays: number
  /** Days from email.archivedAt before a task-done email becomes METADATA_ONLY (default 30) */
  taskDoneMetadataOnlyAfterDays: number
  /** Days from email.metadataOnlyAt during which the email can be restored (default 30) */
  taskDoneRestoreWindowDays: number
  /** Days from receivedAt before attachment tracking records are cleared (default 60) */
  attachmentPurgeAfterDays: number
  /** Days after PURGED before the row is permanently DELETEd (default 90) */
  purgeGracePeriodDays: number
  /** Days a pending-review email can wait before being auto-dismissed to ignored (default 15) */
  staleReviewDismissAfterDays: number
  /** Days after task.completedAt to clean up the task (default 30; allowed: 7/14/30/60) */
  taskRetainAfterDays: number
}

export type ProtectionRuleSnapshot = {
  ruleType: ProtectionRuleType
  /** Semantics by type:
   *  CONTACT → full sender address (case-insensitive), e.g. "alice@acme.com"
   *  DOMAIN  → domain without @, e.g. "acme.com"
   *  LABEL   → Gmail label name, e.g. "STARRED", "IMPORTANT"
   */
  value: string
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type RetentionActionNone = {
  action: 'none'
  reason: string
}

export type RetentionActionArchive = {
  action: 'archive'
  reason: string
}

export type RetentionActionMetadataOnly = {
  action: 'metadataOnly'
  reason: string
  /** When the restore window closes. After this date the next run will purge. */
  restorableUntil: Date
}

export type RetentionActionPurge = {
  action: 'purge'
  reason: string
}

export type RetentionAction =
  | RetentionActionNone
  | RetentionActionArchive
  | RetentionActionMetadataOnly
  | RetentionActionPurge

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function parseLabels(labelsJson: string): string[] {
  try {
    const parsed = JSON.parse(labelsJson)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

/** Extract bare email address from a sender string like "Alice <alice@acme.com>" */
function extractEmailAddress(sender: string): string {
  const match = sender.match(/[^<\s]+@[^>\s]+/)
  return match ? match[0].toLowerCase() : sender.toLowerCase()
}

/** Extract domain from a sender string */
function extractDomain(sender: string): string {
  const addr = extractEmailAddress(sender)
  const parts = addr.split('@')
  return parts.length === 2 ? parts[1] : ''
}

function getAlwaysProtectedLabelReason(labels: string[]) {
  if (labels.includes('STARRED')) {
    return 'email is starred (STARRED label)'
  }
  if (labels.includes('IMPORTANT')) {
    return 'email is marked important (IMPORTANT label)'
  }
  return null
}

function buildPurgeAction(reason: string): RetentionActionPurge {
  return { action: 'purge', reason }
}

function buildNoneAction(reason: string): RetentionActionNone {
  return { action: 'none', reason }
}

type ProtectionCheckResult =
  | { isProtected: true; reason: string }
  | { isProtected: false }

function checkProtection(
  email: EmailSnapshot,
  rules: ProtectionRuleSnapshot[]
): ProtectionCheckResult {
  const labels = parseLabels(email.labels)

  // Hardcoded: starred and important are always protected regardless of rules
  const hardcodedLabelReason = getAlwaysProtectedLabelReason(labels)
  if (hardcodedLabelReason) {
    return { isProtected: true, reason: hardcodedLabelReason }
  }

  const senderAddress = extractEmailAddress(email.sender)
  const senderDomain = extractDomain(email.sender)

  for (const rule of rules) {
    switch (rule.ruleType) {
      case 'CONTACT':
        if (senderAddress === rule.value.toLowerCase()) {
          return { isProtected: true, reason: `sender ${senderAddress} matches contact whitelist` }
        }
        break
      case 'DOMAIN':
        if (senderDomain === rule.value.toLowerCase()) {
          return { isProtected: true, reason: `sender domain ${senderDomain} matches domain whitelist` }
        }
        break
      case 'LABEL':
        if (labels.includes(rule.value)) {
          return { isProtected: true, reason: `email has protected label: ${rule.value}` }
        }
        break
    }
  }

  return { isProtected: false }
}

// ---------------------------------------------------------------------------
// Main engine function
// ---------------------------------------------------------------------------

/**
 * Determine the retention action to apply to an email.
 *
 * @param email     - Snapshot of the email row (with resolved completedTaskAt)
 * @param policy    - User's retention policy (or defaults if not configured)
 * @param rules     - User's protection/whitelist rules
 * @param now       - Current time (injectable for testing; defaults to new Date())
 * @returns         RetentionAction describing what should be done (or 'none')
 */
export function getRetentionAction(
  email: EmailSnapshot,
  policy: PolicySnapshot,
  rules: ProtectionRuleSnapshot[],
  now: Date = new Date()
): RetentionAction {
  // Already fully purged — nothing to do
  if (email.retentionStatus === 'PURGED') {
    return buildNoneAction('email is already purged')
  }

  // Protection check — takes precedence over all rules
  const protection = checkProtection(email, rules)
  if (protection.isProtected) {
    return { action: 'none', reason: `protected: ${protection.reason}` }
  }

  return email.completedTaskAt !== null
    ? applyTaskDoneRules(email, policy, now)
    : applyGeneralRules(email, policy, now)
}

/**
 * Rules for emails linked to a completed task.
 *
 * Timeline (days counted from task completion, then from archivedAt):
 *   taskDoneArchiveAfterDays (default 0) → ARCHIVED
 *   + taskDoneMetadataOnlyAfterDays (default 30) → METADATA_ONLY
 *   + taskDoneRestoreWindowDays (default 30) → PURGED
 */
function applyTaskDoneRules(
  email: EmailSnapshot,
  policy: PolicySnapshot,
  now: Date
): RetentionAction {
  const {
    taskDoneArchiveAfterDays,
    taskDoneMetadataOnlyAfterDays,
    taskDoneRestoreWindowDays,
  } = policy

  // completedTaskAt is guaranteed non-null here (caller checks)
  const completedAt = email.completedTaskAt!

  switch (email.retentionStatus) {
    case 'ACTIVE': {
      const daysSinceCompletion = differenceInDays(now, completedAt)
      if (daysSinceCompletion >= taskDoneArchiveAfterDays) {
        return {
          action: 'archive',
          reason: `linked task completed ${daysSinceCompletion}d ago (threshold: ${taskDoneArchiveAfterDays}d)`,
        }
      }
      return buildNoneAction('task completed but archive threshold not reached')
    }

    case 'ARCHIVED': {
      const archivedAt = email.archivedAt ?? now // fallback: treat as just archived
      const daysSinceArchived = differenceInDays(now, archivedAt)
      if (daysSinceArchived >= taskDoneMetadataOnlyAfterDays) {
        const restorableUntil = addDays(archivedAt, taskDoneMetadataOnlyAfterDays + taskDoneRestoreWindowDays)
        return {
          action: 'metadataOnly',
          reason: `archived ${daysSinceArchived}d ago (threshold: ${taskDoneMetadataOnlyAfterDays}d)`,
          restorableUntil,
        }
      }
      return buildNoneAction('archived but metadata-only threshold not reached')
    }

    case 'METADATA_ONLY': {
      const restorableUntil = email.restorableUntil
      if (restorableUntil !== null && now > restorableUntil) {
        return buildPurgeAction(`restore window expired on ${restorableUntil.toISOString()}`)
      }
      return buildNoneAction('within restore window')
    }

    case 'PURGED':
      return buildNoneAction('email is already purged')
  }
}

/**
 * Rules for emails with no linked completed task.
 *
 * Timeline (days counted from receivedAt):
 *   metadataOnlyAfterDays (default 30) → METADATA_ONLY
 *   purgeAfterDays (default 90) → PURGED
 *
 * restorableUntil is set to receivedAt + purgeAfterDays so the user knows
 * exactly when the purge will happen.
 */
function applyGeneralRules(
  email: EmailSnapshot,
  policy: PolicySnapshot,
  now: Date
): RetentionAction {
  const { metadataOnlyAfterDays, purgeAfterDays } = policy
  const daysSinceReceived = differenceInDays(now, email.receivedAt)
  const purgeDate = addDays(email.receivedAt, purgeAfterDays)
  const purgeReason = `received ${daysSinceReceived}d ago, exceeds purge threshold of ${purgeAfterDays}d`

  switch (email.retentionStatus) {
    case 'ACTIVE':
    case 'ARCHIVED': {
      // ARCHIVED without a completed task = treat same as ACTIVE for general rules
      if (daysSinceReceived >= purgeAfterDays) {
        // Crossed both thresholds — go straight to purge
        return buildPurgeAction(purgeReason)
      }
      if (daysSinceReceived >= metadataOnlyAfterDays) {
        return {
          action: 'metadataOnly',
          reason: `received ${daysSinceReceived}d ago (threshold: ${metadataOnlyAfterDays}d)`,
          restorableUntil: purgeDate,
        }
      }
      return buildNoneAction('email is within active retention window')
    }

    case 'METADATA_ONLY': {
      if (daysSinceReceived >= purgeAfterDays) {
        return buildPurgeAction(purgeReason)
      }
      return buildNoneAction('within retention window')
    }

    case 'PURGED':
      return buildNoneAction('email is already purged')
  }
}

// ---------------------------------------------------------------------------
// Convenience: default policy (matches product spec defaults)
// ---------------------------------------------------------------------------

export const DEFAULT_RETENTION_POLICY: PolicySnapshot = {
  metadataOnlyAfterDays: 30,
  purgeAfterDays: 90,
  taskDoneArchiveAfterDays: 0,
  taskDoneMetadataOnlyAfterDays: 30,
  taskDoneRestoreWindowDays: 30,
  attachmentPurgeAfterDays: 60,
  purgeGracePeriodDays: 90,
  staleReviewDismissAfterDays: 15,
  taskRetainAfterDays: 30,
}
