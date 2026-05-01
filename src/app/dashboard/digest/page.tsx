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
  Mail,
  Clock,
  ChevronDown,
  ChevronRight,
  BarChart3,
  ListTodo,
} from 'lucide-react'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'
import ReactMarkdown from 'react-markdown'
import { useState } from 'react'

type Period = 'daily' | 'weekly'

type DigestStats = {
  actionCount?: number
  awarenessCount?: number
  unresolvedCount?: number
  ignoredCount?: number
  taskTotal?: number
  taskPending?: number
}

type DigestRecord = {
  id: string
  period: Period
  periodStart: string
  createdAt: string
  content: string
  stats: string | DigestStats | null
  isPreview?: boolean
}

export default function DigestPage() {
  const queryClient = useQueryClient()
  const [activePeriod, setActivePeriod] = useState<Period>('daily')

  const { data: res, isLoading } = useQuery({
    queryKey: ['digests'],
    queryFn: () => fetch('/api/digest?limit=20').then((r) => r.json()),
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
  const digests = allDigests.filter((digest) => digest.period === activePeriod)
  const latestDigest = digests[0]

  return (
    <div className="animate-in fade-in space-y-6 duration-200">
      <PageHeader
        title="Digest"
        description="Review AI summaries of your latest email activity and workload patterns."
        meta={`${allDigests.length} saved digest${allDigests.length === 1 ? '' : 's'}`}
        actions={(
          <Button
            onClick={() => generateDigest.mutate()}
            disabled={generateDigest.isPending}
            className="gap-2"
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
                {allDigests.filter((digest) => digest.period === 'daily').length}
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
                {allDigests.filter((digest) => digest.period === 'weekly').length}
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
      ) : digests.length === 0 ? (
        <StatePanel
          icon={<BarChart3 className="h-5 w-5 text-gray-400" />}
          title={`No ${activePeriod} digests yet`}
          description={`Generate your first ${activePeriod} summary to start building digest history.`}
          action={(
            <Button
              onClick={() => generateDigest.mutate()}
              disabled={generateDigest.isPending}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${generateDigest.isPending ? 'animate-spin' : ''}`} />
              Generate Digest
            </Button>
          )}
        />
      ) : (
        <div className="space-y-6">
          {latestDigest ? <DigestHighlight digest={latestDigest} /> : null}

          <div className="space-y-4">
            <h2 className="px-1 text-sm font-semibold uppercase tracking-wider text-gray-500">
              {activePeriod === 'daily' ? 'Daily' : 'Weekly'} History
            </h2>
            {digests.map((digest) => (
              <DigestCard key={digest.id} digest={digest} isLatest={digest.id === latestDigest?.id} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DigestHighlight({ digest }: { digest: DigestRecord }) {
  const stats = parseStats(digest.stats)
  const taskTotal = stats.taskTotal || 0
  const taskPending = stats.taskPending || 0

  const cards = [
    {
      label: 'Action Items',
      value: stats.actionCount || 0,
      icon: CheckCircle2,
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
    {
      label: 'FYI',
      value: stats.awarenessCount || 0,
      icon: Eye,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'AI Suggestions',
      value: stats.unresolvedCount || 0,
      icon: AlertTriangle,
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
    },
    {
      label: 'Total Processed',
      value:
        (stats.actionCount || 0) +
        (stats.awarenessCount || 0) +
        (stats.unresolvedCount || 0) +
        (stats.ignoredCount || 0),
      icon: Mail,
      color: 'text-gray-600',
      bg: 'bg-gray-50',
    },
  ]

  return (
    <div className="animate-fade-in-up stagger-2">
      <div className="mb-3 flex items-center gap-2 px-1">
        <TrendingUp className="h-4 w-4 text-blue-600" />
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Latest - {new Date(digest.periodStart).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label} className="border-gray-200/80 bg-white/95 shadow-sm">
            <CardContent className="py-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">{card.label}</span>
                <div className={`rounded-lg p-1.5 ${card.bg}`}>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {taskTotal > 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50/70 px-4 py-3">
          <ListTodo className="h-4 w-4 shrink-0 text-gray-400" />
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{taskTotal} task{taskTotal !== 1 ? 's' : ''}</span> extracted from this period
            {taskPending > 0 ? (
              <> - <span className="font-semibold text-yellow-700">{taskPending}</span> AI suggestion{taskPending === 1 ? '' : 's'}</>
            ) : ' - all active or processed'}
          </p>
        </div>
      )}

      {(stats.actionCount || 0) > 0 ? (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3">
          <TrendingUp className="h-5 w-5 shrink-0 text-blue-600" />
          <div>
            <p className="text-sm font-medium text-blue-900">
              {(stats.actionCount || 0) >= 5
                ? 'Busy day!'
                : (stats.actionCount || 0) >= 3
                  ? 'Moderate workload'
                  : 'Light day'}{' '}
              - {stats.actionCount} action item{stats.actionCount !== 1 ? 's' : ''} identified
            </p>
            <p className="mt-0.5 text-xs text-blue-700">
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

function DigestCard({ digest, isLatest }: { digest: DigestRecord; isLatest: boolean }) {
  const [expanded, setExpanded] = useState(isLatest)
  const stats = parseStats(digest.stats)

  const periodLabel = digest.period === 'daily' ? 'Daily' : 'Weekly'
  const dateLabel = new Date(digest.periodStart).toLocaleDateString('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <Card className={`animate-fade-in-up stagger-3 border-gray-200/80 bg-white/95 shadow-sm ${isLatest ? 'ring-1 ring-blue-200' : ''}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-50"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">
              {periodLabel} Digest - {dateLabel}
            </span>
            {isLatest ? (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                Latest
              </span>
            ) : null}
            {digest.isPreview ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                This week so far
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-red-400" />
            {stats.actionCount || 0}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3 text-blue-400" />
            {stats.awarenessCount || 0}
          </span>
          <span className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-yellow-400" />
            {stats.unresolvedCount || 0}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {timeAgo(digest.createdAt)}
          </span>
        </div>
      </button>

      {expanded ? (
        <div className="border-t px-5 py-4">
          <div className="prose prose-sm max-w-none text-gray-700 prose-headings:text-gray-900 prose-h2:mb-2 prose-h2:mt-4 prose-h2:text-lg prose-h2:font-bold prose-h3:mb-1 prose-h3:mt-3 prose-h3:text-base prose-h3:font-semibold prose-strong:text-gray-900 prose-li:my-0.5 prose-ul:my-1 prose-ol:my-1">
            <ReactMarkdown>{digest.content}</ReactMarkdown>
          </div>
        </div>
      ) : null}
    </Card>
  )
}

function parseStats(raw: string | DigestStats | null | undefined): DigestStats {
  try {
    const parsed: Record<string, number> = typeof raw === 'string' ? JSON.parse(raw) : raw || {}
    return {
      // new field names (from updated pipeline)
      actionCount:    parsed.actionCount    ?? parsed.actionTasks    ?? 0,
      awarenessCount: parsed.awarenessCount ?? parsed.awarenessEmails ?? 0,
      unresolvedCount:parsed.unresolvedCount ?? 0,
      ignoredCount:   parsed.ignoredCount   ?? parsed.ignoredEmails  ?? 0,
      taskTotal:      parsed.taskTotal      ?? parsed.standaloneTasks ?? 0,
      taskPending:    parsed.taskPending    ?? 0,
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
