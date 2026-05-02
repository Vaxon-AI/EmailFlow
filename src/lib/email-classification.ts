import { AlertTriangle, CheckSquare, Eye, Mail, Trash2 } from 'lucide-react'

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
    label: 'Needs Review',
    color: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    bg: 'from-yellow-50/50 to-white',
    icon: AlertTriangle,
  },
}

/** Fallback-safe lookup — always returns a config. */
export function getEmailClassConfig(classification?: string | null): EmailClassConfig {
  return EMAIL_CLASS_CONFIG[(classification as EmailCategory) ?? ''] ?? EMAIL_CLASS_CONFIG.uncertain
}
