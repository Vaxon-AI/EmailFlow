'use client'

// Small shared presentational helpers + formatters for the demo pages.
// Pure UI — no store, no network.

import type { ReactNode } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ThumbsUp, X } from 'lucide-react'
import { getPriorityBand, getPriorityColor, getPriorityLabel } from '@/types'
import {
  EMAIL_DISPLAY_CONFIG,
  getEmailDisplayState,
  type EmailDisplayState,
} from '@/lib/email-classification'
import type { DemoEmail, DemoTaskStatus } from '@/lib/demo/types'
import { cn } from '@/lib/utils'

const DAY_MS = 86_400_000

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

/** Relative date for email rows: time today, "Yesterday", weekday, or date. */
export function formatEmailDate(iso: string): string {
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / DAY_MS)
  if (days <= 0) return d.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString('en', { weekday: 'short' })
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

export function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export interface DeadlineInfo {
  label: string
  overdue: boolean
  dueToday: boolean
}

/** Human deadline label relative to today. */
export function formatDeadline(iso: string | null): DeadlineInfo | null {
  if (!iso) return null
  const d = startOfDay(new Date(iso))
  const today = startOfDay(new Date())
  const diff = Math.round((d.getTime() - today.getTime()) / DAY_MS)
  if (diff === 0) return { label: 'Due today', overdue: false, dueToday: true }
  if (diff === 1) return { label: 'Due tomorrow', overdue: false, dueToday: false }
  if (diff === -1) return { label: '1 day overdue', overdue: true, dueToday: false }
  if (diff < 0) return { label: `${-diff} days overdue`, overdue: true, dueToday: false }
  if (diff < 7) return { label: `Due in ${diff} days`, overdue: false, dueToday: false }
  return {
    label: `Due ${new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' })}`,
    overdue: false,
    dueToday: false,
  }
}

export function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

// ---------- badges ----------

export function PriorityBadge({ score }: { score: number }) {
  const band = getPriorityBand(score)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
        getPriorityColor(band),
      )}
    >
      {getPriorityLabel(band)}
    </span>
  )
}

/** Task status config — mirrors `statusConfig` in the real task detail page. */
export const TASK_STATUS_CONFIG: Record<
  DemoTaskStatus,
  {
    label: string
    /** Pill background + text (compact StatusChip). */
    chip: string
    /** Outline badge: bg + text + border (detail header). */
    badge: string
    /** Gradient background for the detail header card. */
    headerBg: string
    icon: typeof AlertTriangle
  }
> = {
  pending: {
    label: 'AI Suggestion',
    chip: 'bg-ai-100 text-ai-700',
    badge: 'bg-ai-50 text-ai-700 border-ai-100',
    headerBg: 'from-ai-50/50 to-white',
    icon: AlertTriangle,
  },
  confirmed: {
    label: 'Active',
    chip: 'bg-brand-100 text-brand-700',
    badge: 'bg-brand-50 text-brand-700 border-brand-200',
    headerBg: 'from-brand-50/50 to-white',
    icon: ThumbsUp,
  },
  completed: {
    label: 'Completed',
    chip: 'bg-success-100 text-success',
    badge: 'bg-success-50 text-success border-success-100',
    headerBg: 'from-green-50/50 to-white',
    icon: CheckCircle2,
  },
  dismissed: {
    label: 'Dismissed',
    chip: 'bg-gray-100 text-gray-500',
    badge: 'bg-gray-50 text-gray-500 border-gray-200',
    headerBg: 'from-gray-50/50 to-white',
    icon: X,
  },
}

export function StatusChip({ status }: { status: DemoTaskStatus }) {
  const s = TASK_STATUS_CONFIG[status]
  return (
    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', s.chip)}>
      {s.label}
    </span>
  )
}

/** The email's display bucket — single source for chip + tab + accent bar. */
export function displayStateOf(
  email: Pick<DemoEmail, 'classification' | 'actioned'>,
): EmailDisplayState {
  return getEmailDisplayState({ classification: email.classification, actioned: email.actioned })
}

/** Email classification chip — label + colours come straight from the real
 *  product's EMAIL_DISPLAY_CONFIG, so the demo reads identically. */
export function ClassChip({ state, className }: { state: EmailDisplayState; className?: string }) {
  const cfg = EMAIL_DISPLAY_CONFIG[state]
  const Icon = cfg.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
        cfg.color,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  )
}

// ---------- misc ----------

export function StatCard({
  label,
  value,
  icon,
  tone = 'brand',
  hint,
  href,
}: {
  label: string
  value: ReactNode
  icon: ReactNode
  tone?: 'brand' | 'critical' | 'warning' | 'success'
  hint?: string
  /** When provided the whole card becomes a Link with hover-lift styling. */
  href?: string
}) {
  const toneClass = {
    brand: 'bg-brand-50 text-brand-600',
    critical: 'bg-critical-50 text-critical',
    warning: 'bg-yellow-50 text-warning-700',
    success: 'bg-success-50 text-success',
  }[tone]
  const body = (
    <div
      className={cn(
        'rounded-xl border border-gray-200/80 bg-white p-4 shadow-sm transition-all duration-200',
        href && 'cursor-pointer hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', toneClass)}>{icon}</div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p> : null}
    </div>
  )
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">{children}</h2>
  )
}

export function EmptyHint({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-white/60 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-50 text-gray-400">
        {icon}
      </div>
      <p className="max-w-sm text-sm text-gray-500">{text}</p>
    </div>
  )
}
