'use client'

// Demo Digest — mirrors src/app/dashboard/digest/page.tsx structure.
// Same Daily/Weekly tabs with count badges, same Emails/Tasks split highlight
// with clickable stat cards, same workload indicator, same per-digest card
// with action/awareness/unresolved/timeAgo micro-stats and Live/Latest
// badges. Data layer is the demo store (no API).

import { useMemo, useState } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  RefreshCw,
  TrendingUp,
} from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { SegmentedControl } from '@/components/segmented-control'
import { Card, CardContent } from '@/components/ui/card'
import { useDemoStore } from '@/lib/demo/store'
import type { DemoDigest } from '@/lib/demo/types'
import { cn } from '@/lib/utils'
import { EmptyHint, formatLongDate, timeAgo } from '../_components/demo-bits'

type Period = 'daily' | 'weekly'

type DigestStatCard = {
  label: string
  value: number
  icon: typeof CheckCircle2
  color: string
  bg: string
  href: string
}

// Same period dedup logic as real digest L82-83, L183-205 — a saved digest
// that falls in the same day/week window as the current one is skipped so
// the list doesn't show "Today (live)" then "Today (saved)" twice.
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function localDayKey(iso: string): string {
  return localDateKey(new Date(iso))
}

function localWeekKey(iso: string): string {
  const d = new Date(iso)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const weekStart = new Date(d)
  weekStart.setDate(weekStart.getDate() + diff)
  return localDateKey(weekStart)
}

function isSameDigestWindow(a: DemoDigest, b: DemoDigest): boolean {
  if (a.period !== b.period) return false
  return a.period === 'weekly'
    ? localWeekKey(a.periodStart) === localWeekKey(b.periodStart)
    : localDayKey(a.periodStart) === localDayKey(b.periodStart)
}

// Mirrors real `digestPeriodLink` (L208-215). Demo emails/tasks pages don't
// currently filter by date, but emitting from/to keeps URLs identical so the
// tab/status filter still navigates to the right view.
function digestPeriodLink(
  base: string,
  digest: DemoDigest,
  extra: Record<string, string>,
): string {
  const start = new Date(digest.periodStart)
  const end = new Date(start)
  if (digest.period === 'weekly') end.setDate(end.getDate() + 6)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const params = new URLSearchParams({ ...extra, from: fmt(start), to: fmt(end) })
  return `${base}?${params.toString()}`
}

export default function DemoDigestPage() {
  const { digests, simulateGenerateDigest } = useDemoStore()
  const [period, setPeriod] = useState<Period>('daily')
  const [generating, setGenerating] = useState(false)

  const allForPeriod = useMemo(
    () => digests.filter((d) => d.period === period),
    [digests, period],
  )

  const current = useMemo(
    () => allForPeriod.find((d) => d.isCurrent),
    [allForPeriod],
  )

  // Saved digests for this period, excluding any that fall in the same window
  // as the current one (so the list doesn't double-show).
  const savedDigests = useMemo(
    () =>
      allForPeriod
        .filter((d) => !d.isCurrent)
        .filter((d) => !current || !isSameDigestWindow(d, current))
        .sort((a, b) => b.periodStart.localeCompare(a.periodStart)),
    [allForPeriod, current],
  )

  const displayDigests = current ? [current, ...savedDigests] : savedDigests
  const highlightDigest = current ?? savedDigests[0]
  const latestSavedDigest = savedDigests[0]

  const savedDailyCount = useMemo(
    () => digests.filter((d) => d.period === 'daily' && !d.isCurrent).length,
    [digests],
  )
  const savedWeeklyCount = useMemo(
    () => digests.filter((d) => d.period === 'weekly' && !d.isCurrent).length,
    [digests],
  )

  const runGenerate = async () => {
    setGenerating(true)
    await simulateGenerateDigest(period)
    setGenerating(false)
  }

  const badge = (n: number, active: boolean) => (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
        active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {n}
    </span>
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Digest"
        description="Review AI summaries of your latest email activity and workload patterns."
        meta={`${savedDailyCount + savedWeeklyCount} saved digest${savedDailyCount + savedWeeklyCount === 1 ? '' : 's'}`}
        actions={
          <button
            type="button"
            onClick={runGenerate}
            disabled={generating}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-60"
          >
            <RefreshCw className={cn('h-4 w-4', generating && 'animate-spin')} />
            {generating ? 'Generating…' : 'Generate Digest'}
          </button>
        }
      />

      <SegmentedControl
        value={period}
        onChange={(v) => setPeriod(v as Period)}
        options={[
          { value: 'daily', label: 'Daily', badge: badge(savedDailyCount, period === 'daily') },
          { value: 'weekly', label: 'Weekly', badge: badge(savedWeeklyCount, period === 'weekly') },
        ]}
      />

      {generating && (
        <div className="flex items-center gap-2 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm text-brand-700">
          <RefreshCw className="h-4 w-4 animate-spin" />
          EmailFlow is summarising your {period} activity…
        </div>
      )}

      {!highlightDigest ? (
        <EmptyHint icon={<BarChart3 className="h-5 w-5" />} text={`No ${period} digests yet.`} />
      ) : (
        <div className="space-y-4">
          <DigestHighlight digest={highlightDigest} />

          <div className="space-y-2.5">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
              {period === 'daily' ? 'Daily' : 'Weekly'} Digest
            </h2>
            {displayDigests.map((digest, index) => (
              <DigestCard
                key={`${period}-${digest.id}-${index === 0 ? 'first' : 'row'}`}
                digest={digest}
                defaultOpen={index === 0}
                isLatestSaved={!digest.isCurrent && digest.id === latestSavedDigest?.id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DigestHighlight({ digest }: { digest: DemoDigest }) {
  const { stats } = digest

  const emailCards: DigestStatCard[] = [
    {
      label: 'Needs Action',
      value: stats.actionCount,
      icon: CheckCircle2,
      color: 'text-critical',
      bg: 'bg-critical-50',
      href: digestPeriodLink('/demo/emails', digest, { tab: 'needs_action' }),
    },
    {
      label: 'Tracked',
      value: stats.trackedCount,
      icon: CheckCircle2,
      color: 'text-brand-700',
      bg: 'bg-brand-50',
      href: digestPeriodLink('/demo/emails', digest, { tab: 'tracked' }),
    },
    {
      label: 'FYI',
      value: stats.awarenessCount,
      icon: Eye,
      color: 'text-brand-500',
      bg: 'bg-brand-50/70',
      href: digestPeriodLink('/demo/emails', digest, { tab: 'fyi' }),
    },
  ]

  const taskCards: DigestStatCard[] = [
    {
      label: 'Active',
      value: stats.taskActive,
      icon: CheckCircle2,
      color: 'text-brand-700',
      bg: 'bg-brand-50',
      href: digestPeriodLink('/demo/tasks', digest, { status: 'active' }),
    },
    {
      label: 'AI Suggestions',
      value: stats.taskPending,
      icon: AlertTriangle,
      color: 'text-ai-700',
      bg: 'bg-ai-50',
      href: digestPeriodLink('/demo/tasks', digest, { status: 'ai_suggestion' }),
    },
    {
      label: 'Completed',
      value: stats.taskCompleted,
      icon: CheckCircle2,
      color: 'text-success',
      bg: 'bg-success-50',
      href: digestPeriodLink('/demo/tasks', digest, { status: 'completed' }),
    },
  ]

  const workloadLabel =
    stats.actionCount >= 5 ? 'Busy day!' : stats.actionCount >= 3 ? 'Moderate workload' : 'Light day'

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <TrendingUp className="h-4 w-4 text-brand-600" />
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {digest.isCurrent ? 'Live' : 'Latest'} · {formatLongDate(digest.periodStart)}
        </span>
      </div>

      <section>
        <h3 className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Emails
        </h3>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {emailCards.map((card) => (
            <DigestStatLink key={`email-${card.label}`} card={card} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Tasks
        </h3>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {taskCards.map((card) => (
            <DigestStatLink key={`task-${card.label}`} card={card} />
          ))}
        </div>
      </section>

      {stats.actionCount > 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-brand-100 bg-brand-50/50 px-2.5 py-2">
          <TrendingUp className="h-4 w-4 shrink-0 text-brand-600" />
          <div>
            <p className="text-sm font-medium text-gray-900">
              {workloadLabel} — {stats.actionCount} needs action email
              {stats.actionCount !== 1 ? 's' : ''} identified
            </p>
            <p className="mt-0.5 text-xs text-brand-700">
              {stats.unresolvedCount > 0
                ? `${stats.unresolvedCount} item${stats.unresolvedCount !== 1 ? 's' : ''} need${stats.unresolvedCount === 1 ? 's' : ''} your manual review`
                : 'All emails were confidently classified'}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DigestStatLink({ card }: { card: DigestStatCard }) {
  return (
    <Link href={card.href} className="block rounded-md transition-all hover:shadow-md">
      <Card className="h-full rounded-md border-gray-200/80 bg-white/95 shadow-sm transition-colors hover:border-gray-300">
        <CardContent className="px-2 py-2">
          <div className="mb-0.5 flex items-center justify-between">
            <span className="text-[11px] font-medium text-gray-500">{card.label}</span>
            <div className={cn('rounded p-0.5', card.bg)}>
              <card.icon className={cn('h-3 w-3', card.color)} />
            </div>
          </div>
          <p className="text-base font-bold text-gray-900">{card.value}</p>
        </CardContent>
      </Card>
    </Link>
  )
}

function DigestCard({
  digest,
  defaultOpen,
  isLatestSaved,
}: {
  digest: DemoDigest
  defaultOpen: boolean
  isLatestSaved: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const { stats } = digest
  const periodLabel = digest.isCurrent
    ? digest.period === 'daily'
      ? 'Today'
      : 'This Week'
    : digest.period === 'daily'
      ? 'Daily'
      : 'Weekly'

  return (
    <Card
      className={cn(
        'border-gray-200/80 bg-white/95 shadow-sm',
        defaultOpen && 'ring-1 ring-brand-200',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-50"
      >
        <ChevronRight
          className={cn(
            'h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200',
            open && 'rotate-90',
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">
              {periodLabel} Digest — {formatLongDate(digest.periodStart)}
            </span>
            {digest.isCurrent ? (
              <span className="rounded-full bg-success-100 px-2 py-0.5 text-[10px] font-semibold text-success">
                Live
              </span>
            ) : isLatestSaved ? (
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                Latest
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-critical" />
            {stats.actionCount}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3 text-brand-500" />
            {stats.awarenessCount}
          </span>
          <span className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-warning" />
            {stats.unresolvedCount}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {timeAgo(digest.createdAt)}
          </span>
        </div>
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t px-5 py-4">
            <div className="prose prose-sm max-w-none text-gray-700 prose-headings:text-gray-900 prose-h2:mb-2 prose-h2:mt-4 prose-h2:text-base prose-h2:font-bold prose-strong:text-gray-900 prose-li:my-0.5 prose-ul:my-1">
              <ReactMarkdown>{digest.content}</ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
