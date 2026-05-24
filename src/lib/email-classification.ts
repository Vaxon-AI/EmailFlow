import { AlertTriangle, CheckCircle2, CheckSquare, Eye, Mail, Trash2 } from 'lucide-react'

import type { EmailCategory } from '@/types'

export type EmailClassConfig = {
  label: string
  /** Badge colour classes (text + bg + border) */
  color: string
  /** Gradient bg used in detail page header */
  bg: string
  /** Lucide icon component */
  icon: typeof Mail
}

// Email classification chips run denser than task priority chips (every row
// in the inbox has one), so they earn solid fills instead of tints — the
// list needs strong scannable tags. Two solid attention states use distinct
// hues so the user can tell "AI says act" from "AI wasn't sure" at a glance:
//   action    → solid critical red    (the strongest "deal with this")
//   uncertain → solid warning amber   (AI couldn't decide, you must)
//   awareness → brand tint            (informational, calm)
//   ignore    → outlined neutral      (de-emphasised, almost invisible)
export const EMAIL_CLASS_CONFIG: Record<EmailCategory, EmailClassConfig> = {
  action: {
    label: 'Needs Action',
    // bg-critical (red-600 #DC2626) — same hue as the identity/project
    // attention tip on the same page (which uses text-critical = red-600).
    // Solid bg + white text reads strong without being as deep as -700.
    color: 'bg-critical text-white border-critical',
    bg: 'from-critical-50 to-white',
    icon: CheckSquare,
  },
  awareness: {
    label: 'FYI',
    color: 'bg-brand-50 text-brand-700 border-brand-100',
    bg: 'from-brand-50/40 to-white',
    icon: Eye,
  },
  ignore: {
    label: 'Ignored',
    color: 'bg-white text-gray-500 border-gray-200',
    bg: 'from-gray-50/40 to-white',
    icon: Trash2,
  },
  uncertain: {
    label: 'Uncertain',
    // Solid amber bg + white text — pairs visually with Needs Action's
    // solid red + white text (both attention chips share the "saturated bg
    // + white" pattern, distinct in hue).
    color: 'bg-warning text-white border-warning',
    bg: 'from-warning-50 to-white',
    icon: AlertTriangle,
  },
}

/** Fallback-safe lookup — always returns a config. */
export function getEmailClassConfig(classification?: string | null): EmailClassConfig {
  return EMAIL_CLASS_CONFIG[(classification as EmailCategory) ?? ''] ?? EMAIL_CLASS_CONFIG.uncertain
}

// ---------------------------------------------------------------------------
// Two layers, deliberately decoupled:
//
//  1. EmailBucket (4 values) — what the user can SELECT in the picker.
//     Each bucket maps deterministically to a (classification, actioned) pair
//     written by `setEmailBucket` in email-repo.ts.
//
//  2. EmailDisplayState (6 values) — what the UI SHOWS, including 'uncertain'
//     for emails the AI couldn't confidently classify. The picker can't
//     produce 'uncertain' (it's an AI-internal state), but rows / headers /
//     badges need to surface it visually so users notice and can resolve.
//
// `actioned: true` always wins for both — a once-uncertain email that became
// a task lives in Tracked, not Uncertain.
// ---------------------------------------------------------------------------

export type EmailBucket = 'needs_action' | 'tracked' | 'fyi' | 'ignored'
export type EmailTabBucket = EmailBucket | 'unclassified'

// Bucket hierarchy — Needs Action is the only solid chip, deliberately
// painted critical red so it pops out of the list. Tracked / FYI step down
// in saturation; Ignored is almost invisible.
export const EMAIL_BUCKET_CONFIG: Record<EmailBucket, EmailClassConfig> = {
  needs_action: {
    label: 'Needs Action',
    color: 'bg-critical text-white border-critical',
    bg: 'from-critical-50 to-white',
    icon: CheckSquare,
  },
  tracked: {
    label: 'Tracked',
    color: 'bg-brand-50 text-brand-700 border-brand-100',
    bg: 'from-brand-50/40 to-white',
    icon: CheckCircle2,
  },
  fyi: {
    label: 'FYI',
    color: 'bg-white text-gray-700 border-gray-200',
    bg: 'from-gray-50/30 to-white',
    icon: Eye,
  },
  ignored: {
    label: 'Ignored',
    color: 'bg-transparent text-gray-400 border-gray-200',
    bg: 'from-gray-50/40 to-white',
    icon: Trash2,
  },
}

export type EmailDisplayState = EmailTabBucket | 'uncertain'

export const EMAIL_DISPLAY_CONFIG: Record<EmailDisplayState, EmailClassConfig> = {
  ...EMAIL_BUCKET_CONFIG,
  uncertain: EMAIL_CLASS_CONFIG.uncertain,
  unclassified: {
    label: 'Unclassified',
    // Solid amber bg + white text — pairs visually with Needs Action's
    // solid red + white text (both attention chips share the "saturated bg
    // + white" pattern, distinct in hue).
    color: 'bg-warning text-white border-warning',
    bg: 'from-warning-50 to-white',
    icon: AlertTriangle,
  },
}

const CLASSIFICATION_TO_DISPLAY_STATE: Record<string, Exclude<EmailDisplayState, 'tracked' | 'unclassified'>> = {
  action: 'needs_action',
  awareness: 'fyi',
  ignore: 'ignored',
  uncertain: 'uncertain',
}

function hasTrackedTask(input: { taskLinks?: unknown[] | null }) {
  return (input.taskLinks?.length ?? 0) > 0
}

function isTrackedActionEmail(input: { classification?: string | null; actioned?: boolean | null }) {
  return input.actioned === true && input.classification === 'action'
}

function getDisplayStateFromClassification(classification?: string | null): EmailDisplayState {
  if (!classification) return 'unclassified'
  return CLASSIFICATION_TO_DISPLAY_STATE[classification] ?? 'needs_action'
}

export function getEmailDisplayState(input: {
  classification?: string | null
  actioned?: boolean | null
  taskLinks?: unknown[] | null
  processingStatus?: string | null
}): EmailDisplayState {
  if (hasTrackedTask(input)) return 'tracked'
  if (isTrackedActionEmail(input)) return 'tracked'
  return getDisplayStateFromClassification(input.classification)
}

// ---------------------------------------------------------------------------
// Detail-page tones — these are LIGHTER than the list-chip `color` / `bg`
// above on purpose. In a list, every row is a tag so the chip needs solid
// saturation to pop out. On a detail page, there's only ONE classification
// banner, so a tinted card reads cleaner and lets the email body itself
// carry visual weight. Both the real `/dashboard/emails/[id]` and demo
// `/demo/emails/[id]` import these — keeping them in one place avoids drift.
// ---------------------------------------------------------------------------

/** Chip / banner colour set (text + bg + border) for the email detail page. */
export const EMAIL_DETAIL_TONE: Record<EmailDisplayState, string> = {
  needs_action: 'bg-critical-50/70 text-critical border-critical-100',
  tracked: 'bg-brand-50 text-brand-700 border-brand-100',
  fyi: 'bg-white text-gray-700 border-gray-200',
  ignored: 'bg-transparent text-gray-400 border-gray-200',
  uncertain: 'bg-warning-50/70 text-warning-700 border-warning-100',
  unclassified: 'bg-warning-50/70 text-warning-700 border-warning-100',
}

/** Gradient header background (`from-…` half) used by the detail card header. */
export const EMAIL_DETAIL_HEADER_BG: Record<EmailDisplayState, string> = {
  needs_action: 'from-critical-50/25 via-white to-white',
  tracked: 'from-brand-50/30 via-white to-white',
  fyi: 'from-gray-50/30 via-white to-white',
  ignored: 'from-gray-50/25 via-white to-white',
  uncertain: 'from-warning-50/20 via-white to-white',
  unclassified: 'from-warning-50/20 via-white to-white',
}
