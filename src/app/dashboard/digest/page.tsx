'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { SegmentedControl } from '@/components/segmented-control'
import { StatePanel } from '@/components/state-panel'
import {
  RefreshCw,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Clock,
  ChevronRight,
  BarChart3,
} from 'lucide-react'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'
import ReactMarkdown from 'react-markdown'
import Link from 'next/link'
import { useState } from 'react'

type Period = 'daily' | 'weekly'

type DigestStats = {
  actionCount?: number
  trackedCount?: number
  awarenessCount?: number
  unresolvedCount?: number
  ignoredCount?: number
  taskTotal?: number
  taskActive?: number
  taskPending?: number
  taskCompleted?: number
}

type DigestRecord = {
  id: string
  period: Period
  periodStart: string
  createdAt: string
  content: string
  stats: string | DigestStats | null
  isPreview?: boolean
  isCurrent?: boolean
}

export default function DigestPage() {
  const queryClient = useQueryClient()
  const [activePeriod, setActivePeriod] = useState<Period>('daily')

  const { data: res, isLoading } = useQuery({
    queryKey: ['digests', activePeriod],
    queryFn: () => fetch(`/api/digest?limit=20&current=${activePeriod}`).then((r) => r.json()),
    refetchInterval: 60000,
  })


  const generateDigest = useMutation({
    mutationFn: () => fetch('/api/digest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period: activePeriod }),
    }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['digests'] })
        toast.success('Digest generated')
      } else {
        showError(data.error?.message || 'Failed to generate digest')
      }
    },
  })

  const allDigests: DigestRecord[] = res?.data || []
  const savedDigests = allDigests.filter((digest) => !digest.isCurrent)
  const currentDigest = allDigests.find((digest) => digest.isCurrent && digest.period === activePeriod)
  const digests = savedDigests
    .filter((digest) => digest.period === activePeriod)
    .filter((digest) => !currentDigest || !isSameDigestWindow(digest, currentDigest))
  const displayDigests = currentDigest ? [currentDigest, ...digests] : digests
  const highlightDigest = currentDigest ?? digests[0]
  const latestSavedDigest = digests[0]

  return (
    <div className="animate-in fade-in space-y-4 duration-200">
      <PageHeader
        title="Digest"
        description="Review AI summaries of your latest email activity and workload patterns."
        meta={`${savedDigests.length} saved digest${savedDigests.length === 1 ? '' : 's'}`}
        actions={(
          <Button
            onClick={() => generateDigest.mutate()}
            disabled={generateDigest.isPending}
            className="gap-2 bg-brand-600 text-white hover:bg-brand-700"
          >
            <RefreshCw className={`h-4 w-4 ${generateDigest.isPending ? 'animate-spin' : ''}`} />
            Generate Digest
          </Button>
        )}
      />

      <SegmentedControl
        value={activePeriod}
        onChange={(value) => setActivePeriod(value as Period)}
        options={[
          {
            value: 'daily',
            label: 'Daily',
            badge: (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  activePeriod === 'daily' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {savedDigests.filter((digest) => digest.period === 'daily').length}
              </span>
            ),
          },
          {
            value: 'weekly',
            label: 'Weekly',
            badge: (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  activePeriod === 'weekly' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {savedDigests.filter((digest) => digest.period === 'weekly').length}
              </span>
            ),
          },
        ]}
      />

      {isLoading ? (
        <StatePanel
          loading
          title="Loading digests"
          description="Collecting your recent summaries and digest history."
        />
      ) : !highlightDigest ? (
        <StatePanel
          icon={<BarChart3 className="h-5 w-5 text-gray-400" />}
          title={`No ${activePeriod} digests yet`}
          description={`Generate your first ${activePeriod} summary to start building digest history.`}
          action={(
            <Button
              onClick={() => generateDigest.mutate()}
              disabled={generateDigest.isPending}
              className="gap-2 bg-brand-600 text-white hover:bg-brand-700"
            >
              <RefreshCw className={`h-4 w-4 ${generateDigest.isPending ? 'animate-spin' : ''}`} />
              Generate Digest
            </Button>
          )}
        />
      ) : (
        <div className="space-y-4">
          {highlightDigest ? <DigestHighlight digest={highlightDigest} /> : null}

          <div className="space-y-2.5">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
              {activePeriod === 'daily' ? 'Daily' : 'Weekly'} Digest
            </h2>
            {displayDigests.map((digest, index) => (
              <DigestCard
                key={`${activePeriod}-${digest.id}-${index === 0 ? 'first' : 'row'}`}
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

function isSameDigestWindow(digest: DigestRecord, currentDigest: DigestRecord) {
  if (digest.period !== currentDigest.period) return false
  if (currentDigest.period === 'weekly') {
    return localWeekKey(digest.periodStart) === localWeekKey(currentDigest.periodStart)
  }
  return localDayKey(digest.periodStart) === localDayKey(currentDigest.periodStart)
}

function localDayKey(dateStr: string) {
  return localDateKey(new Date(dateStr))
}

function localWeekKey(dateStr: string) {
  const date = new Date(dateStr)
  const weekStart = new Date(date)
  const day = weekStart.getDay()
  const diff = day === 0 ? -6 : 1 - day
  weekStart.setDate(weekStart.getDate() + diff)
  return localDateKey(weekStart)
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function digestPeriodLink(base: string, digest: DigestRecord, extra: Record<string, string> = {}) {
  const start = new Date(digest.periodStart)
  const end = new Date(start)
  end.setDate(end.getDate() + (digest.period === 'weekly' ? 6 : 0))
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const sp = new URLSearchParams({ ...extra, from: fmt(start), to: fmt(end) })
  return `${base}?${sp.toString()}`
}

type DigestCard = {
  label: string
  value: number
  icon: typeof CheckCircle2
  color: string
  bg: string
  href: string
}

function DigestHighlight({ digest }: { digest: DigestRecord }) {
  const stats = parseStats(digest.stats)

  const emailCards: DigestCard[] = [
    {
      label: 'Needs Action',
      value: stats.actionCount || 0,
      icon: CheckCircle2,
      color: 'text-critical',
      bg: 'bg-critical-50',
      href: digestPeriodLink('/dashboard/emails', digest, { tab: 'needs_action' }),
    },
    {
      label: 'Tracked',
      value: stats.trackedCount || 0,
      icon: CheckCircle2,
      color: 'text-brand-700',
      bg: 'bg-brand-50',
      href: digestPeriodLink('/dashboard/emails', digest, { tab: 'tracked' }),
    },
    {
      label: 'FYI',
      value: stats.awarenessCount || 0,
      icon: Eye,
      color: 'text-brand-500',
      bg: 'bg-brand-50/70',
      href: digestPeriodLink('/dashboard/emails', digest, { tab: 'fyi' }),
    },
  ]

  const taskCards: DigestCard[] = [
    {
      label: 'Active',
      value: stats.taskActive || 0,
      icon: CheckCircle2,
      color: 'text-brand-700',
      bg: 'bg-brand-50',
      href: digestPeriodLink('/dashboard/tasks', digest, { status: 'active' }),
    },
    {
      label: 'AI Suggestions',
      value: stats.taskPending || 0,
      icon: AlertTriangle,
      color: 'text-ai-700',
      bg: 'bg-ai-50',
      href: digestPeriodLink('/dashboard/tasks', digest, { status: 'ai_suggestion' }),
    },
    {
      label: 'Completed',
      value: stats.taskCompleted || 0,
      icon: CheckCircle2,
      color: 'text-success',
      bg: 'bg-success-50',
      href: digestPeriodLink('/dashboard/tasks', digest, { status: 'completed' }),
    },
  ]

  return (
    <div className="animate-fade-in-up stagger-2 space-y-3">
      <div className="flex items-center gap-2 px-1">
        <TrendingUp className="h-4 w-4 text-brand-600" />
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {digest.isCurrent ? 'Live' : 'Latest'} - {new Date(digest.periodStart).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })}
        </span>
      </div>

      <section>
        <h3 className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Emails</h3>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {emailCards.map((card) => (
            <DigestStatLink key={`email-${card.label}`} card={card} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Tasks</h3>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {taskCards.map((card) => (
            <DigestStatLink key={`task-${card.label}`} card={card} />
          ))}
        </div>
      </section>

      {(stats.actionCount || 0) > 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-brand-100 bg-brand-50/50 px-2.5 py-2">
          <TrendingUp className="h-4 w-4 shrink-0 text-brand-600" />
          <div>
            <p className="text-sm font-medium text-gray-900">
              {(stats.actionCount || 0) >= 5
                ? 'Busy day!'
                : (stats.actionCount || 0) >= 3
                  ? 'Moderate workload'
                  : 'Light day'}{' '}
              - {stats.actionCount} needs action email{stats.actionCount !== 1 ? 's' : ''} identified
            </p>
            <p className="mt-0.5 text-xs text-brand-700">
              {(stats.unresolvedCount || 0) > 0
                ? `${stats.unresolvedCount} item${stats.unresolvedCount !== 1 ? 's' : ''} need${stats.unresolvedCount === 1 ? 's' : ''} your manual review`
                : 'All emails were confidently classified'}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DigestStatLink({ card }: { card: DigestCard }) {
  return (
    <Link
      href={card.href}
      className="block rounded-md transition-all hover:shadow-md"
    >
      <Card className="h-full rounded-md border-gray-200/80 bg-white/95 shadow-sm transition-colors hover:border-gray-300">
        <CardContent className="px-2 py-2">
          <div className="mb-0.5 flex items-center justify-between">
            <span className="text-[11px] font-medium text-gray-500">{card.label}</span>
            <div className={`rounded p-0.5 ${card.bg}`}>
              <card.icon className={`h-3 w-3 ${card.color}`} />
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
  digest: DigestRecord
  defaultOpen: boolean
  isLatestSaved: boolean
}) {
  const [expanded, setExpanded] = useState(defaultOpen)
  const stats = parseStats(digest.stats)

  const periodLabel = digest.isCurrent ? (digest.period === 'daily' ? 'Today' : 'This Week') : (digest.period === 'daily' ? 'Daily' : 'Weekly')
  const dateLabel = new Date(digest.periodStart).toLocaleDateString('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <Card className={`animate-fade-in-up stagger-3 border-gray-200/80 bg-white/95 shadow-sm ${defaultOpen ? 'ring-1 ring-brand-200' : ''}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-50"
      >
        <ChevronRight className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">
              {periodLabel} Digest - {dateLabel}
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
            {digest.isPreview && digest.isCurrent && digest.period === 'weekly' ? (
              <span className="rounded-full bg-warning-100 px-2 py-0.5 text-[10px] font-semibold text-warning-700">
                This week so far
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-critical" />
            {stats.actionCount || 0}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3 text-brand-500" />
            {stats.awarenessCount || 0}
          </span>
          <span className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-warning" />
            {stats.unresolvedCount || 0}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {timeAgo(digest.createdAt)}
          </span>
        </div>
      </button>

      <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="border-t px-5 py-4">
            <div className="prose prose-sm max-w-none text-gray-700 prose-headings:text-gray-900 prose-h2:mb-2 prose-h2:mt-4 prose-h2:text-lg prose-h2:font-bold prose-h3:mb-1 prose-h3:mt-3 prose-h3:text-base prose-h3:font-semibold prose-strong:text-gray-900 prose-li:my-0.5 prose-ul:my-1 prose-ol:my-1">
              <ReactMarkdown>{digest.content}</ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

function parseStats(raw: string | DigestStats | null | undefined): DigestStats {
  try {
    const parsed: Record<string, number> = typeof raw === 'string' ? JSON.parse(raw) : raw || {}
    return {
      // new field names (from updated pipeline)
      actionCount:    parsed.actionCount    ?? parsed.actionTasks    ?? 0,
      trackedCount:   parsed.trackedCount   ?? parsed.trackedEmails  ?? 0,
      awarenessCount: parsed.awarenessCount ?? parsed.awarenessEmails ?? 0,
      unresolvedCount:parsed.unresolvedCount ?? 0,
      ignoredCount:   parsed.ignoredCount   ?? parsed.ignoredEmails  ?? 0,
      taskTotal:      parsed.taskTotal      ?? parsed.standaloneTasks ?? 0,
      taskActive:     parsed.taskActive     ?? Math.max(0, (parsed.taskTotal ?? parsed.standaloneTasks ?? 0) - (parsed.taskPending ?? 0)),
      taskPending:    parsed.taskPending    ?? 0,
      taskCompleted:  parsed.taskCompleted  ?? parsed.completedTasks ?? 0,
    }
  } catch {
    return {}
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
