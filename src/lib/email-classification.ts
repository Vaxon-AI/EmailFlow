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

export const EMAIL_CLASS_CONFIG: Record<EmailCategory, EmailClassConfig> = {
  action: {
    label: 'Needs Action',
    color: 'bg-red-50 text-red-700 border-red-200',
    bg: 'from-red-50/50 to-white',
    icon: CheckSquare,
  },
  awareness: {
    label: 'FYI',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    bg: 'from-blue-50/50 to-white',
    icon: Eye,
  },
  ignore: {
    label: 'Ignored',
    color: 'bg-gray-50 text-gray-500 border-gray-200',
    bg: 'from-gray-50/50 to-white',
    icon: Trash2,
  },
  uncertain: {
    label: 'Uncertain',
    color: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    bg: 'from-yellow-50/50 to-white',
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
//  2. EmailDisplayState (5 values) — what the UI SHOWS, including 'uncertain'
//     for emails the AI couldn't confidently classify. The picker can't
//     produce 'uncertain' (it's an AI-internal state), but rows / headers /
//     badges need to surface it visually so users notice and can resolve.
//
// `actioned: true` always wins for both — a once-uncertain email that became
// a task lives in Tracked, not Uncertain.
// ---------------------------------------------------------------------------

export type EmailBucket = 'needs_action' | 'tracked' | 'fyi' | 'ignored'

export const EMAIL_BUCKET_CONFIG: Record<EmailBucket, EmailClassConfig> = {
  needs_action: {
    label: 'Needs Action',
    color: 'bg-red-50 text-red-700 border-red-200',
    bg: 'from-red-50/50 to-white',
    icon: CheckSquare,
  },
  tracked: {
    label: 'Tracked',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    bg: 'from-emerald-50/50 to-white',
    icon: CheckCircle2,
  },
  fyi: {
    label: 'FYI',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    bg: 'from-blue-50/50 to-white',
    icon: Eye,
  },
  ignored: {
    label: 'Ignored',
    color: 'bg-gray-50 text-gray-500 border-gray-200',
    bg: 'from-gray-50/50 to-white',
    icon: Trash2,
  },
}

export type EmailDisplayState = EmailBucket | 'uncertain'

export const EMAIL_DISPLAY_CONFIG: Record<EmailDisplayState, EmailClassConfig> = {
  ...EMAIL_BUCKET_CONFIG,
  uncertain: {
    label: 'Uncertain',
    color: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    bg: 'from-yellow-50/50 to-white',
    icon: AlertTriangle,
  },
}

export function getEmailDisplayState(input: {
  classification?: string | null
  actioned?: boolean | null
}): EmailDisplayState {
  if (input.actioned) return 'tracked'
  if (input.classification === 'ignore') return 'ignored'
  if (input.classification === 'awareness') return 'fyi'
  if (input.classification === 'uncertain') return 'uncertain'
  // action, null/undefined, anything else → needs_action
  return 'needs_action'
}
