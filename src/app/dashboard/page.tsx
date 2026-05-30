'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  BarChart3,
  CheckSquare,
  Clock,
  FolderOpen,
  Mail,
  PieChart,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
} from 'lucide-react'
import { format } from 'date-fns'

import { PageHeader } from '@/components/page-header'
import { SegmentedControl } from '@/components/segmented-control'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useSyncSetup } from '@/components/sync-setup/sync-setup-provider'
import { getPriorityBand, getPriorityColor, getPriorityLabel } from '@/types'
import { useAuth } from '@/lib/use-auth'
import { cn } from '@/lib/utils'
import { CACHE_TIME } from '@/lib/query-cache'
import { toast } from 'sonner'

import {
  DASHBOARD_VIEWS,
  UNCATEGORIZED_ID,
  UNCATEGORIZED_OPTION,
  type DashboardContextCount,
  type DashboardProject,
  type DashboardSummaryResponse,
  type DashboardTask,
  type DashboardView,
} from './dashboard-types'
import {
  addLocalDays,
  formatDateKey,
  getViewPeriodLabel,
  parseContextParam,
  parseDashboardView,
  parseMomentumEnd,
  setMultiParam,
  startOfLocalDay,
  timeAgo,
} from './dashboard-helpers'
import {
  ChartCardSkeleton,
  DashboardPageFallback,
  MomentumCardSkeleton,
  StatCardSkeleton,
} from './dashboard-skeletons'
import { BarRow, DonutChart, LegendDot, StatCard } from './dashboard-charts'
import { ContextMultiFilter } from './dashboard-context-filter'
import { CompletionMomentumCard } from './dashboard-momentum-card'

import { GuidedTour, type TourStep } from '@/components/guided-tour'

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardPageFallback />}>
      <DashboardContent />
    </Suspense>
  )
}

function DashboardContent() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedIdentityIds = useMemo(() => parseContextParam(searchParams, 'identity'), [searchParams])
  const selectedProjectIds = useMemo(() => parseContextParam(searchParams, 'project'), [searchParams])
  const selectedView = useMemo(() => parseDashboardView(searchParams.get('view')), [searchParams])
  const selectedMomentumEnd = useMemo(() => parseMomentumEnd(searchParams.get('momentumEnd')), [searchParams])
  const timezoneOffset = useMemo(() => new Date().getTimezoneOffset(), [])
  const { openSyncSetup, openUpgrade } = useSyncSetup()

  const [tourOpen, setTourOpen] = useState(false)
  const { data: tourSeenRes } = useQuery({
    queryKey: ['dashboard-tour-seen'],
    queryFn: () => fetch('/api/dashboard/tour-seen').then((r) => r.json()),
    enabled: !!user,
  })

  useEffect(() => {
    if (tourSeenRes?.data?.seen === false && !searchParams.get('gmail_connected')) {
      setTimeout(() => setTourOpen(true), 0)
    } else if (searchParams.get('replay_tour') === '1') {
      setTimeout(() => setTourOpen(true), 0)
      // Clean up the URL
      const params = new URLSearchParams(searchParams.toString())
      params.delete('replay_tour')
      const query = params.toString()
      router.replace(query ? `/dashboard?${query}` : '/dashboard', { scroll: false })
    }
  }, [tourSeenRes, searchParams, router])

  const completeTour = async () => {
    setTourOpen(false)
    await fetch('/api/dashboard/tour-seen', { method: 'POST' })
  }

  const tourSteps: TourStep[] = [
    {
      target: '[data-tour="dashboard-overview"]',
      title: 'Start from your dashboard',
      content: 'This is your workspace overview. EmailFlow summarises your synced emails, generated tasks, deadlines, and priority items in one place.',
      placement: 'inside-top',
    },
    {
      target: '[data-tour="dashboard-filters"]',
      title: 'Choose your time view',
      content: 'Switch between Today, This Week, and All Time to understand your current workload and progress from different time ranges.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="dashboard-attention"]',
      title: 'Review what needs your attention',
      content: 'EmailFlow highlights emails and tasks that may need your review first, so you can decide what to handle next.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="dashboard-charts"]',
      title: 'Track your progress',
      content: 'Use task overview and priority distribution to see what is completed, what is still active, and which tasks are most urgent.',
      placement: 'top',
    },
    {
      target: '[data-tour="dashboard-momentum"]',
      title: 'View work by context',
      content: 'Track how many tasks you have completed over time and compare it with your created tasks and action emails.',
      placement: 'top',
    },
    {
      target: '[data-tour="dashboard-tasks"]',
      title: 'Top Priority Tasks',
      content: 'Review your highest-priority tasks first. You can open each task to check details, deadlines, source emails, and next actions.',
      placement: 'top',
    },
    {
      target: '[data-tour="sidebar"]',
      title: 'Move to the next workspace',
      content: 'Use the sidebar to open Tasks, Emails, Digest, and Settings when you want to review details or manage your account.',
      placement: 'right',
    },
  ]

  useEffect(() => {
    const gmailError = searchParams.get('gmail_error')
    if (!gmailError) return
    const messages: Record<string, string> = {
      google_account_already_bound: 'This Google account is already linked to another user.',
      token_exchange_failed: 'Google sign-in failed. Please try again.',
      userinfo_failed: 'Could not retrieve your Google account info. Please try again.',
      missing_access_token: 'Google sign-in failed. Please try again.',
      missing_code: 'Google sign-in was cancelled or incomplete.',
      missing_google_env: 'Google sign-in is not configured on this server.',
      no_provider_id: 'Google sign-in failed: missing account identifier.',
      server_error: 'An unexpected error occurred. Please try again.',
    }
    toast.error(messages[gmailError] ?? 'Google sign-in failed. Please try again.')
    router.replace('/dashboard', { scroll: false })
  }, [searchParams, router])

  // First-time OAuth callback — open the two-step setup modal owned by the
  // dashboard-layout provider so it works from any future trigger too.
  useEffect(() => {
    if (searchParams.get('gmail_connected') === '1') {
      openSyncSetup('gmail-connected')
      router.replace('/dashboard', { scroll: false })
    }
  }, [searchParams, router, openSyncSetup])

    const { data: projectsRes } = useQuery<{ data?: DashboardProject[] }>({
    queryKey: ['projects'],
    queryFn: () => fetch('/api/projects').then((r) => r.json()),
    staleTime: CACHE_TIME.list,
  })

  const projects = useMemo(() => projectsRes?.data ?? [], [projectsRes?.data])
  const identities = useMemo(() => {
    const map = new Map<string, DashboardContextCount>()
    for (const project of projects) {
      if (!project.identity) continue
      map.set(project.identity.id, { id: project.identity.id, name: project.identity.name })
    }
    return [...Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)), UNCATEGORIZED_OPTION]
  }, [projects])
  const filteredProjects = useMemo(
    () => {
      if (selectedIdentityIds.length === 0) return []
      return projects.filter((project) =>
        project.identityId
          ? selectedIdentityIds.includes(project.identityId)
          : selectedIdentityIds.includes(UNCATEGORIZED_ID)
      )
    },
    [projects, selectedIdentityIds]
  )
  const projectOptions = useMemo(
    () => selectedIdentityIds.length === 0 ? [] : [...filteredProjects, UNCATEGORIZED_OPTION],
    [filteredProjects, selectedIdentityIds.length]
  )
  const effectiveProjectIds = useMemo(
    () => selectedProjectIds.filter((id) => projectOptions.some((project) => project.id === id)),
    [projectOptions, selectedProjectIds]
  )

  const updateDashboardFilter = useCallback((next: { identities?: string[]; projects?: string[]; view?: DashboardView; momentumEnd?: string | null }) => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('gmail_connected')
    params.delete('gmail_error')

    if (next.identities !== undefined) {
      setMultiParam(params, 'identity', next.identities)
      params.delete('project')
    }

    if (next.projects !== undefined) {
      setMultiParam(params, 'project', next.projects)
    }

    if (next.view !== undefined) {
      params.set('view', next.view)
      if (next.view !== 'all') params.delete('momentumEnd')
    }

    if (next.momentumEnd !== undefined) {
      if (next.momentumEnd) params.set('momentumEnd', next.momentumEnd)
      else params.delete('momentumEnd')
    }

    const query = params.toString()
    router.replace(query ? `/dashboard?${query}` : '/dashboard', { scroll: false })
  }, [router, searchParams])

  // Free-plan AI quota — shared cache key with sidebar so both stay in sync.
  const { data: quotaRes } = useQuery<{
    data: {
      plan: string
      classify: { used: number; limit: number | null; resetAt: string }
      extract: { used: number; limit: number | null; resetAt: string }
    }
  }>({
    queryKey: ['quota'],
    queryFn: () => fetch('/api/settings/quota').then((r) => r.json()),
    staleTime: CACHE_TIME.stats,
    enabled: user?.plan === 'free',
  })
  const quota = quotaRes?.data

  const { data: summaryRes, isLoading: summaryLoading } = useQuery<DashboardSummaryResponse>({
    queryKey: ['dashboard-summary', selectedIdentityIds.join(','), effectiveProjectIds.join(','), selectedView, selectedMomentumEnd, timezoneOffset],
    queryFn: () => {
      const params = new URLSearchParams()
      setMultiParam(params, 'identity', selectedIdentityIds)
      setMultiParam(params, 'project', effectiveProjectIds)
      params.set('view', selectedView)
      if (selectedView === 'all' && selectedMomentumEnd) params.set('momentumEnd', selectedMomentumEnd)
      params.set('timezoneOffset', String(timezoneOffset))
      const query = params.toString()
      return fetch(`/api/dashboard/summary${query ? `?${query}` : ''}`).then((r) => r.json())
    },
    staleTime: CACHE_TIME.stats,
    placeholderData: (prev) => prev,
  })

  const summary = summaryRes?.data
  const s = summary?.stats
  const allTimeStats = summary?.allTime?.stats
  const allTimeTasks = summary?.allTime?.tasks
  const providerReauthRequired = Boolean(s?.sync?.providerReauthRequired)

  const completedTasks = s?.tasks?.completed ?? 0
  const pendingTaskCount = summary?.tasks.pendingCount ?? 0
  const activeTaskCount = summary?.tasks.activeCount ?? 0
  const totalTasks = completedTasks + pendingTaskCount + activeTaskCount
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
  const emailData = s?.emails ?? { total: 0, action: 0, awareness: 0, ignore: 0, uncertain: 0, linkedAction: 0, needsReview: 0, tracked: 0 }
  const allTimeCompletedTasks = allTimeStats?.tasks.completed ?? completedTasks
  const allTimeOpenTasks = (allTimeTasks?.activeCount ?? activeTaskCount) + (allTimeTasks?.pendingCount ?? pendingTaskCount)
  const activeTasks = summary?.tasks.activePreview ?? []
  const pendingTasks = summary?.tasks.pendingPreview ?? []
  const attentionEmails = summary?.attentionEmails ?? []
  const attentionEmailCount = summary?.attentionEmailCount ?? attentionEmails.length
  const priorityCounts = summary?.tasks.priorityCounts ?? { critical: 0, high: 0, medium: 0, low: 0 }
  const upcomingCount = summary?.tasks.upcomingCount ?? 0
  const aiAcceptance = summary?.tasks.aiAcceptance ?? { accepted: 0, rejected: 0, rate: null }
  const momentum = summary?.momentum ?? []
  const periodLabel = getViewPeriodLabel(selectedView)
  const dueTitle = selectedView === 'today' ? 'Due Today' : selectedView === 'week' ? 'Due This Week' : 'Due This Week'
  const dueDetail = selectedView === 'all' ? 'Open deadlines in 7 days' : `Open deadlines ${periodLabel.toLowerCase()}`
  const dashboardQuery = useMemo(() => {
    const params = new URLSearchParams()
    setMultiParam(params, 'identity', selectedIdentityIds)
    setMultiParam(params, 'project', effectiveProjectIds)
    params.set('view', selectedView)
    if (selectedView === 'all' && selectedMomentumEnd) params.set('momentumEnd', selectedMomentumEnd)
    return params.toString()
  }, [effectiveProjectIds, selectedIdentityIds, selectedMomentumEnd, selectedView])
  const dashboardLink = useCallback((path: string, params?: Record<string, string>) => {
    const next = new URLSearchParams(dashboardQuery)
    for (const [key, value] of Object.entries(params ?? {})) {
      next.set(key, value)
    }
    const query = next.toString()
    return query ? `${path}?${query}` : path
  }, [dashboardQuery])
  const updateMomentumWindow = useCallback((direction: 'previous' | 'next' | 'latest') => {
    const currentEnd = selectedMomentumEnd ? new Date(`${selectedMomentumEnd}T00:00:00`) : startOfLocalDay(new Date())
    const latestEnd = startOfLocalDay(new Date())
    let nextEnd = latestEnd
    if (direction === 'previous') nextEnd = addLocalDays(currentEnd, -14)
    if (direction === 'next') nextEnd = addLocalDays(currentEnd, 14)
    if (nextEnd > latestEnd) nextEnd = latestEnd
    updateDashboardFilter({ momentumEnd: formatDateKey(nextEnd) })
  }, [selectedMomentumEnd, updateDashboardFilter])

  return (
    <div className="space-y-6">
      <div data-tour="dashboard-overview" className="space-y-6 flex flex-col">
        <PageHeader
          title={`Hi, ${user?.name?.split(' ')[0] || 'there'}`}
          description="Your email-to-task command center."
          actions={
            <>
              {/* Quota chip: only surfaces once usage crosses 70%. Below that
                  threshold the sidebar progress bar is sufficient and a chip
                  here would just be visual noise. */}
              {user?.plan === 'free' && quota && quota.classify.limit ? (() => {
                const used = quota.classify.used
                const limit = quota.classify.limit ?? 1
                const ratio = used / limit
                if (ratio < 0.7) return null
                const tone = ratio >= 0.9
                  ? 'border-critical-100 bg-critical-50 text-critical-700 hover:bg-critical-100'
                  : 'border-warning-200 bg-warning-100/60 text-warning-700 hover:bg-warning-100'
                return (
                  <button
                    type="button"
                    onClick={openUpgrade}
                    className={cn(
                      'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors',
                      tone
                    )}
                    title={`Resets ${format(new Date(quota.classify.resetAt), 'MMM d')}`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{used}/{limit}</span>
                    <span className="hidden text-xs font-normal opacity-80 sm:inline">· Upgrade</span>
                  </button>
                )
              })() : null}
              {summaryLoading ? (
                <Skeleton className="h-9 w-28 rounded-lg" />
              ) : providerReauthRequired ? (
                <Link href="/dashboard/settings">
                  <Button size="sm" variant="outline" className="border-critical-100 bg-critical-50 text-critical-700 hover:border-critical-200 hover:bg-critical-100 hover:text-critical-700 hover:shadow-md">
                    Reconnect Email
                  </Button>
                </Link>
              ) : s?.sync?.emailConnected ? (
                <span className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                  Email Connected
                </span>
              ) : (
                <a href="/api/auth/google">
                  <Button size="sm">Connect Email</Button>
                </a>
              )}
            </>
          }
        />

        <div className="animate-fade-in-up stagger-1 rounded-2xl border border-white/70 bg-white/90 p-3 shadow-sm backdrop-blur" data-tour="dashboard-filters">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Workspace context</p>
              <p className="text-xs text-slate-500">Filter dashboard metrics by time, identity, and project.</p>
            </div>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <SegmentedControl
                value={selectedView}
                onChange={(view) => updateDashboardFilter({ view })}
                options={DASHBOARD_VIEWS.map((view) => ({ value: view.id, label: view.label }))}
              />
              <ContextMultiFilter
                icon={<UserRound className="h-3.5 w-3.5 text-slate-400" />}
                label="Identity"
                allLabel="All identities"
                options={identities}
                selectedIds={selectedIdentityIds}
                onChange={(ids) => updateDashboardFilter({ identities: ids })}
              />
              <ContextMultiFilter
                icon={<FolderOpen className="h-3.5 w-3.5 text-slate-400" />}
                label="Project"
                allLabel="All projects"
                options={projectOptions}
                selectedIds={effectiveProjectIds}
                disabled={selectedIdentityIds.length === 0}
                onChange={(ids) => updateDashboardFilter({ projects: ids })}
              />
            </div>
          </div>
        </div>

        <div data-tour="dashboard-attention" className="space-y-3">
          {attentionEmailCount > 0 && (
            <Link href={dashboardLink('/dashboard/emails', { tab: 'needs_action' })} className="group animate-fade-in-up stagger-2 block">
              <div className="flex items-center gap-3 rounded-xl border border-warning-100 bg-yellow-50/55 px-3.5 py-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-warning-200 hover:shadow-md">
                <div className="relative shrink-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warning-100/85 text-warning-700 ring-1 ring-warning-200">
                    <AlertTriangle className="h-4.5 w-4.5" />
                  </div>
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-warning text-[9px] font-bold text-white shadow-sm">
                    {attentionEmailCount}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-warning-700">
                    {attentionEmailCount} email{attentionEmailCount > 1 ? 's' : ''} need your review
                  </p>
                  <p className="truncate text-xs text-warning">
                    {attentionEmails[0]?.subject}
                    {attentionEmailCount > 1 ? ` and ${attentionEmailCount - 1} more...` : ''}
                  </p>
                </div>
                <span className="shrink-0 rounded-lg border border-warning-200 bg-yellow-50/80 px-3 py-1.5 text-xs font-semibold text-warning-700 shadow-sm transition-all group-hover:-translate-y-px group-hover:bg-warning-100/70 group-hover:shadow-md">
                  View
                </span>
              </div>
            </Link>
          )}

          {pendingTaskCount > 0 && (
            <Link href={dashboardLink('/dashboard/tasks', { status: 'ai_suggestion' })} className="group animate-fade-in-up stagger-2 block">
              {/* Banner colour pairs with "X emails need your review" above —
                  both are alert banners, both warning-amber. AI Suggestions's
                  AI identity lives in compact spots (donut legend, status
                  tag), not a full-width attention banner. */}
              <div className="flex items-center gap-3 rounded-xl border border-warning-100 bg-yellow-50/55 px-3.5 py-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-warning-200 hover:shadow-md">
                <div className="relative shrink-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warning-100/85 text-warning-700 ring-1 ring-warning-200">
                    <CheckSquare className="h-4.5 w-4.5" />
                  </div>
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-warning text-[9px] font-bold text-white shadow-sm">
                    {pendingTaskCount}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-warning-700">
                    {pendingTaskCount} AI-suggested task{pendingTaskCount > 1 ? 's' : ''} pending
                  </p>
                  <p className="truncate text-xs text-warning">
                    {pendingTasks[0]?.title}
                    {pendingTaskCount > 1 ? ` and ${pendingTaskCount - 1} more...` : ''}
                  </p>
                </div>
                <span className="shrink-0 rounded-lg border border-warning-200 bg-yellow-50/80 px-3 py-1.5 text-xs font-semibold text-warning-700 shadow-sm transition-all group-hover:-translate-y-px group-hover:bg-warning-100/70 group-hover:shadow-md">
                  View
                </span>
              </div>
            </Link>
          )}
        </div>

        {providerReauthRequired ? (
          <div className="rounded-2xl border border-critical-100 bg-critical-50 px-4 py-3 text-sm text-critical-700">
            Your email connection has expired. Reconnect it in Settings before the next sync.
          </div>
        ) : null}

        <div className="animate-fade-in-up stagger-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryLoading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : (
            <>
              <StatCard
                title="Emails Processed"
                value={emailData.total}
                icon={<Mail className="h-4 w-4 text-brand-600" />}
                detail={`${emailData.needsReview} need action, ${emailData.uncertain} uncertain`}
                href={dashboardLink('/dashboard/emails')}
              />
              <StatCard
                title="Open Tasks"
                value={activeTaskCount + pendingTaskCount}
                icon={<CheckSquare className="h-4 w-4 text-brand-600" />}
                detail={`${completedTasks} completed ${periodLabel.toLowerCase()}, ${allTimeOpenTasks} open total`}
                href={dashboardLink('/dashboard/tasks')}
              />
              <StatCard
                title={dueTitle}
                value={upcomingCount}
                icon={<Target className="h-4 w-4 text-warning" />}
                detail={dueDetail}
              />
              <StatCard
                title="Last Synced"
                value={s?.sync?.lastSyncAt ? timeAgo(s.sync.lastSyncAt) : 'Never'}
                icon={<Clock className="h-4 w-4 text-gray-500" />}
                detail={s?.sync?.emailConnected ? 'Email connected' : 'Not connected'}
              />
            </>
          )}
        </div>
      </div>

      <div className="animate-fade-in-up stagger-4 grid grid-cols-1 gap-4 lg:grid-cols-3" data-tour="dashboard-charts">
        {summaryLoading ? (
          <>
            <ChartCardSkeleton />
            <ChartCardSkeleton />
            <ChartCardSkeleton />
          </>
        ) : (
          <>
            <Card className="border-gray-200/80 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <PieChart className="h-4 w-4 text-brand-600" />
                  Task Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  <DonutChart
                    value={completionRate}
                    size={100}
                    color={completionRate >= 70 ? '#1F7A4D' : completionRate >= 40 ? '#A3640A' : '#C4302B'}
                  />
                  <div className="space-y-1.5 text-sm">
                    <LegendDot color="bg-success" label={`Completed: ${completedTasks}`} />
                    <LegendDot color="bg-brand-600" label={`Active: ${activeTaskCount}`} />
                    <LegendDot color="bg-ai" label={`AI Suggestions: ${pendingTaskCount}`} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200/80 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <BarChart3 className="h-4 w-4 text-brand-600" />
                  Email Classification
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  {/* Bars use saturated mid-tone colours (500/700) so they
                      don't look washed-out next to each other. Needs Action
                      bar matches the email chip's solid red. */}
                  <BarRow label="Needs Action" value={emailData.needsReview} max={emailData.total} color="bg-critical" href={dashboardLink('/dashboard/emails', { tab: 'needs_action' })} />
                  <BarRow label="Tracked" value={emailData.tracked} max={emailData.total} color="bg-brand-700" href={dashboardLink('/dashboard/emails', { tab: 'tracked' })} />
                  <BarRow label="FYI" value={emailData.awareness} max={emailData.total} color="bg-brand-400" href={dashboardLink('/dashboard/emails', { tab: 'fyi' })} />
                  <BarRow label="Ignored" value={emailData.ignore} max={emailData.total} color="bg-gray-500" href={dashboardLink('/dashboard/emails', { tab: 'ignored' })} />
                </div>
                {(emailData.unclassified ?? 0) > 0 && (
                  <Link
                    href={dashboardLink('/dashboard/emails', { tab: 'unclassified' })}
                    className="mt-2.5 inline-flex rounded-lg border border-warning-200 bg-yellow-50/80 px-2.5 py-1.5 text-[11px] font-semibold text-warning-700 shadow-sm transition-all hover:-translate-y-px hover:bg-warning-100/70 hover:shadow-md"
                  >
                    +{emailData.unclassified} unclassified (uncertain or quota-skipped)
                  </Link>
                )}
              </CardContent>
            </Card>

            <Card className="border-gray-200/80 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <TrendingUp className="h-4 w-4 text-warning" />
                  Priority Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  {/* Bright saturated trio — red / orange / yellow at base
                      saturation so the three priorities read as visually
                      distinct hues, not three brown 700-tier shades. */}
                  <BarRow label="Critical" value={priorityCounts.critical} max={totalTasks || 1} color="bg-critical" href="/dashboard/tasks?priority=critical" />
                  <BarRow label="High" value={priorityCounts.high} max={totalTasks || 1} color="bg-orange" href="/dashboard/tasks?priority=high" />
                  <BarRow label="Medium" value={priorityCounts.medium} max={totalTasks || 1} color="bg-yellow" href="/dashboard/tasks?priority=medium" />
                  <BarRow label="Low" value={priorityCounts.low} max={totalTasks || 1} color="bg-gray-400" href="/dashboard/tasks?priority=low" />
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2">
                  <Target className="h-3.5 w-3.5 text-brand-600" />
                  <span className="text-xs text-brand-700">
                    AI task acceptance: <strong>{aiAcceptance.rate === null ? 'Not enough decisions yet' : `${aiAcceptance.rate}%`}</strong>
                  </span>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="animate-fade-in-up stagger-5" data-tour="dashboard-momentum">
        {summaryLoading ? (
          <MomentumCardSkeleton />
        ) : (
          <CompletionMomentumCard
            data={momentum}
            view={selectedView}
            feedback={summary?.feedback}
            allTimeCompletedTasks={allTimeCompletedTasks}
            momentumEnd={selectedView === 'all' ? selectedMomentumEnd : null}
            onMomentumWindowChange={selectedView === 'all' ? updateMomentumWindow : undefined}
          />
        )}
      </div>

      <Card className="animate-fade-in-up stagger-6 border-gray-200/80 shadow-sm" data-tour="dashboard-tasks">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Top Priority Tasks</CardTitle>
            <Link href="/dashboard/tasks" className="inline-flex h-7 items-center rounded-lg border border-brand-100 bg-brand-50/70 px-2.5 text-xs font-semibold text-brand-700 shadow-sm transition-all hover:-translate-y-px hover:border-brand-200 hover:bg-brand-100/70 hover:shadow-md">View all</Link>
          </div>
        </CardHeader>
        <CardContent>
          {summaryLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-3/5" />
                    <Skeleton className="h-3 w-2/5" />
                  </div>
                  <Skeleton className="ml-3 h-5 w-16 shrink-0" />
                </div>
              ))}
            </div>
          ) : activeTasks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckSquare className="h-8 w-8 text-gray-200" />
              <p className="text-sm text-gray-400">No active tasks yet.</p>
              <Link href="/dashboard/tasks">
                <Button variant="utility" size="sm">Open tasks</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {activeTasks.map((task: DashboardTask) => {
                const band = getPriorityBand(task.priorityScore || 0)
                return (
                  <Link
                    key={task.id}
                    href={`/dashboard/tasks/${task.id}`}
                    className="flex items-center justify-between rounded-lg border border-gray-200/80 bg-white p-3 transition-colors hover:bg-gray-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{task.title}</p>
                      <p className="truncate text-xs text-gray-500">{task.summary}</p>
                    </div>
                    <div className="ml-3 flex items-center gap-2">
                      {(task.explicitDeadline || task.inferredDeadline || task.userSetDeadline) && (
                        <span className="text-xs text-gray-400">
                          Due {new Date(task.userSetDeadline ?? task.explicitDeadline ?? task.inferredDeadline ?? '').toLocaleDateString('en-US')}
                        </span>
                      )}
                      <Badge variant="outline" className={getPriorityColor(band)}>
                        {getPriorityLabel(band)}
                      </Badge>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <GuidedTour 
        key={tourOpen ? 'open' : 'closed'}
        steps={tourSteps}
        open={tourOpen}
        onClose={() => setTourOpen(false)}
        onComplete={completeTour}
      />
    </div>
  )
}
