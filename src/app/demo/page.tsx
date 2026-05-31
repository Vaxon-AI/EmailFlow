'use client'

// Demo dashboard — mirrors src/app/dashboard/page.tsx as closely as possible:
// same Workspace-context filter row (time + identity + project), same StatCard
// shape (Emails Processed / Open Tasks / Due Today (or This Week) / Last
// Synced), same charts (Task Overview / Email Classification / Priority
// Distribution / Completion Momentum), all client-side over the demo store.

import Link from 'next/link'
import { Suspense, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  BarChart3,
  CheckSquare,
  Clock,
  FolderOpen,
  Mail,
  PieChart,
  Target,
  TrendingUp,
  UserRound,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { SegmentedControl } from '@/components/segmented-control'
import { getPriorityBand } from '@/types'
import { useDemoStore } from '@/lib/demo/store'
import { effectiveDeadline } from '@/lib/demo/types'
import {
  BarRow,
  DonutChart,
  LegendDot,
  MomentumChart,
  type MomentumPoint,
  type MomentumView,
} from './_components/demo-charts'
import { formatDeadline, PriorityBadge, StatCard } from './_components/demo-bits'
import { ContextMultiFilter, type ContextMultiOption } from './_components/context-multi-filter'

const DAY_MS = 86_400_000
const UNCATEGORIZED_ID = '__uncategorized__'
const UNCATEGORIZED_OPTION: ContextMultiOption = { id: UNCATEGORIZED_ID, name: 'Uncategorized' }

type View = 'all' | 'week' | 'today'

const VIEW_OPTIONS: Array<{ value: View; label: string }> = [
  { value: 'week', label: 'This Week' },
  { value: 'today', label: 'Today' },
  { value: 'all', label: 'All Time' },
]

function parseView(value: string | null): View {
  return value === 'today' || value === 'all' ? value : 'week'
}

function setMultiParam(params: URLSearchParams, key: string, values: string[]) {
  params.delete(key)
  for (const v of values) params.append(key, v)
}

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dateKeyIso(date: Date): string {
  const d = startOfDay(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseMomentumEnd(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : value
}

function addDays(date: Date, days: number): Date {
  const next = startOfDay(date)
  next.setDate(next.getDate() + days)
  return next
}

function windowStart(view: View, now: Date): Date | null {
  if (view === 'today') return startOfDay(now)
  if (view === 'week') return new Date(now.getTime() - 7 * DAY_MS)
  return null
}

function inWindow(iso: string, start: Date | null): boolean {
  return start === null || new Date(iso).getTime() >= start.getTime()
}

const momentumDaysFor = (view: View) => (view === 'week' ? 7 : 14)

const periodLabel = (view: View) =>
  view === 'today' ? 'today' : view === 'week' ? 'this week' : ''

export default function DemoDashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  )
}

function DashboardContent() {
  const {
    tasks,
    emails,
    identities: demoIdentities,
    projects: demoProjects,
    chartHistory,
    getProject,
    now,
  } = useDemoStore()
  const router = useRouter()
  const searchParams = useSearchParams()

  const selectedIdentityIds = useMemo(() => searchParams.getAll('identity'), [searchParams])
  const selectedProjectIds = useMemo(() => searchParams.getAll('project'), [searchParams])
  const view = parseView(searchParams.get('view'))
  const momentumEnd = parseMomentumEnd(searchParams.get('momentumEnd'))
  const ws = useMemo(() => windowStart(view, now), [view, now])

  // Identity options = demo identities + Uncategorized sentinel
  // (mirrors real dashboard L496-503).
  const identityOptions = useMemo<ContextMultiOption[]>(
    () => [
      ...demoIdentities.map((i) => ({ id: i.id, name: i.name })),
      UNCATEGORIZED_OPTION,
    ],
    [demoIdentities],
  )

  // Project options follow selected identity (mirrors real L504-518).
  const projectOptions = useMemo<ContextMultiOption[]>(() => {
    if (selectedIdentityIds.length === 0) return []
    const matched = demoProjects
      .filter((p) =>
        p.identityId
          ? selectedIdentityIds.includes(p.identityId)
          : selectedIdentityIds.includes(UNCATEGORIZED_ID),
      )
      .map((p) => ({ id: p.id, name: p.name }))
    return [...matched, UNCATEGORIZED_OPTION]
  }, [demoProjects, selectedIdentityIds])

  const effectiveProjectIds = useMemo(
    () =>
      selectedProjectIds.filter((id) => projectOptions.some((option) => option.id === id)),
    [projectOptions, selectedProjectIds],
  )

  // Scope filter: does this projectId fall in the selected identity/project filters?
  const inScope = useCallback(
    (projectId: string | null) => {
      if (selectedIdentityIds.length === 0) return true
      const isUncat = projectId === null
      if (effectiveProjectIds.length > 0) {
        if (isUncat) return effectiveProjectIds.includes(UNCATEGORIZED_ID)
        return projectId !== null && effectiveProjectIds.includes(projectId)
      }
      if (isUncat) return selectedIdentityIds.includes(UNCATEGORIZED_ID)
      const project = getProject(projectId)
      const identityId = project?.identityId ?? UNCATEGORIZED_ID
      return selectedIdentityIds.includes(identityId)
    },
    [selectedIdentityIds, effectiveProjectIds, getProject],
  )

  const updateFilter = useCallback(
    (next: { identities?: string[]; projects?: string[]; view?: View; momentumEnd?: string | null }) => {
      const params = new URLSearchParams(searchParams.toString())
      if (next.identities !== undefined) {
        setMultiParam(params, 'identity', next.identities)
        // Reset project when identity changes — projects depend on identity scope.
        params.delete('project')
      }
      if (next.projects !== undefined) setMultiParam(params, 'project', next.projects)
      if (next.view !== undefined) {
        params.set('view', next.view)
        if (next.view !== 'all') params.delete('momentumEnd')
      }
      if (next.momentumEnd !== undefined) {
        if (next.momentumEnd) params.set('momentumEnd', next.momentumEnd)
        else params.delete('momentumEnd')
      }
      const q = params.toString()
      router.replace(q ? `/demo?${q}` : '/demo', { scroll: false })
    },
    [router, searchParams],
  )

  // Builds a child-page URL preserving identity/project/view + extra params.
  // Real dashboard does the same via `dashboardLink` (L608-615).
  const childLink = useCallback(
    (path: string, extra?: Record<string, string>) => {
      const params = new URLSearchParams()
      setMultiParam(params, 'identity', selectedIdentityIds)
      setMultiParam(params, 'project', effectiveProjectIds)
      params.set('view', view)
      if (view === 'all' && momentumEnd) params.set('momentumEnd', momentumEnd)
      for (const [k, v] of Object.entries(extra ?? {})) params.set(k, v)
      const q = params.toString()
      return q ? `${path}?${q}` : path
    },
    [selectedIdentityIds, effectiveProjectIds, momentumEnd, view],
  )

  const stats = useMemo(() => {
    const scopedTasks = tasks.filter((t) => inScope(t.projectId))
    const scopedEmails = emails.filter((e) => inScope(e.projectId))

    const live = scopedTasks
    const open = scopedTasks.filter((t) => t.status === 'ai_suggestion' || t.status === 'active')
    const active = scopedTasks.filter((t) => t.status === 'active')
    const pending = scopedTasks.filter((t) => t.status === 'ai_suggestion')
    const completedInWindow = scopedTasks.filter(
      (t) => t.status === 'completed' && t.completedAt && inWindow(t.completedAt, ws),
    )
    const allTimeCompleted = scopedTasks.filter((t) => t.status === 'completed').length

    const priority = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const t of live) priority[getPriorityBand(t.priorityScore)] += 1

    const nowMs = now.getTime()
    const dueWindowMs =
      view === 'today' ? startOfDay(now).getTime() + DAY_MS - nowMs : 7 * DAY_MS
    let upcoming = 0
    let overdue = 0
    for (const t of open) {
      const raw = effectiveDeadline(t)
      if (!raw) continue
      const diff = new Date(raw).getTime() - nowMs
      if (diff < 0) overdue += 1
      else if (diff <= dueWindowMs) upcoming += 1
    }

    const winEmails = scopedEmails.filter((e) => inWindow(e.receivedAt, ws))
    const email = {
      total: winEmails.length,
      needsAction: winEmails.filter((e) => e.classification === 'action' && !e.actioned).length,
      tracked: winEmails.filter((e) => e.actioned).length,
      awareness: winEmails.filter((e) => e.classification === 'awareness').length,
      ignore: winEmails.filter((e) => e.classification === 'ignore').length,
      uncertain: winEmails.filter((e) => e.classification === 'uncertain' && !e.actioned).length,
    }

    const totalForRate = completedInWindow.length + active.length + pending.length
    const completionRate =
      totalForRate > 0 ? Math.round((completedInWindow.length / totalForRate) * 100) : 0

    return {
      liveCount: live.length,
      open: open.length,
      completed: completedInWindow.length,
      allTimeCompleted,
      active: active.length,
      pending: pending.length,
      priority,
      upcoming,
      overdue,
      email,
      completionRate,
    }
  }, [tasks, emails, now, view, ws, inScope])

  const momentum = useMemo<MomentumPoint[]>(() => {
    const days = momentumDaysFor(view)
    const today = view === 'all' && momentumEnd
      ? startOfDay(new Date(`${momentumEnd}T00:00:00`))
      : startOfDay(now)
    const scopedTasks = tasks.filter((t) => inScope(t.projectId))
    const scopedEmails = emails.filter((e) => inScope(e.projectId))
    const completedBy = new Map<string, number>()
    const createdBy = new Map<string, number>()
    const emailsBy = new Map<string, number>()
    for (const t of scopedTasks) {
      if (t.completedAt) {
        const k = dayKey(t.completedAt)
        completedBy.set(k, (completedBy.get(k) ?? 0) + 1)
      }
      const ck = dayKey(t.createdAt)
      createdBy.set(ck, (createdBy.get(ck) ?? 0) + 1)
    }
    for (const e of scopedEmails) {
      if (e.classification === 'action') {
        const k = dayKey(e.receivedAt)
        emailsBy.set(k, (emailsBy.get(k) ?? 0) + 1)
      }
    }
    // Layer the synthetic per-day backdrop on top of real counts so the
    // chart reads as a smooth trend (busy mid-week, quiet weekends) instead
    // of a single 0→N→0 spike from the 2 real completed tasks. Only blend
    // when the user has NOT filtered to a specific identity/project — under
    // a filter, the chart should honour what's actually in scope.
    if (selectedIdentityIds.length === 0) {
      for (const p of chartHistory) {
        completedBy.set(p.dayKey, (completedBy.get(p.dayKey) ?? 0) + p.completedTasks)
        createdBy.set(p.dayKey, (createdBy.get(p.dayKey) ?? 0) + p.createdTasks)
        emailsBy.set(p.dayKey, (emailsBy.get(p.dayKey) ?? 0) + p.actionEmails)
      }
    }
    const out: MomentumPoint[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY_MS)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      out.push({
        date: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).toISOString(),
        completedTasks: completedBy.get(key) ?? 0,
        createdTasks: createdBy.get(key) ?? 0,
        actionEmails: emailsBy.get(key) ?? 0,
      })
    }
    return out
  }, [tasks, emails, chartHistory, momentumEnd, now, view, inScope, selectedIdentityIds])

  const updateMomentumWindow = useCallback((direction: 'previous' | 'next' | 'latest') => {
    const latest = startOfDay(now)
    const current = momentumEnd ? startOfDay(new Date(`${momentumEnd}T00:00:00`)) : latest
    let next = latest
    if (direction === 'previous') next = addDays(current, -14)
    if (direction === 'next') next = addDays(current, 14)
    if (next > latest) next = latest
    updateFilter({ momentumEnd: dateKeyIso(next) })
  }, [momentumEnd, now, updateFilter])

  const momentumTotals = useMemo(
    () => ({
      completed: momentum.reduce((s, d) => s + d.completedTasks, 0),
      created: momentum.reduce((s, d) => s + d.createdTasks, 0),
      actionEmails: momentum.reduce((s, d) => s + d.actionEmails, 0),
    }),
    [momentum],
  )

  const topTasks = useMemo(
    () =>
      tasks
        .filter((t) => inScope(t.projectId))
        .filter((t) => t.status === 'active')
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .slice(0, 5),
    [tasks, inScope],
  )

  const donutColor =
    stats.completionRate >= 70
      ? '#1F7A4D'
      : stats.completionRate >= 40
        ? '#A3640A'
        : '#C4302B'

  const period = periodLabel(view)
  const dueTitle = view === 'today' ? 'Due Today' : 'Due This Week'
  const dueDetail =
    view === 'today'
      ? 'Open deadlines today'
      : view === 'week'
        ? 'Open deadlines this week'
        : 'Open deadlines in 7 days'
  const emailsDetail = `${stats.email.needsAction} need action, ${stats.email.uncertain} uncertain`
  const openTasksDetail = period
    ? `${stats.completed} completed ${period}, ${stats.open} open total`
    : `${stats.completed} completed, ${stats.open} open total`

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Your email-to-task command center."
        meta="Demo workspace · sample data, nothing is saved"
      />

      {/* Workspace context — mirrors real dashboard L673-704 */}
      <div className="rounded-2xl border border-white/70 bg-white/90 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Workspace context</p>
            <p className="text-xs text-slate-500">
              Filter dashboard metrics by time, identity, and project.
            </p>
          </div>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <SegmentedControl
              value={view}
              onChange={(v) => updateFilter({ view: v as View })}
              options={VIEW_OPTIONS.map((v) => ({ value: v.value, label: v.label }))}
            />
            <ContextMultiFilter
              icon={<UserRound className="h-3.5 w-3.5 text-slate-400" />}
              label="Identity"
              allLabel="All identities"
              options={identityOptions}
              selectedIds={selectedIdentityIds}
              onChange={(ids) => updateFilter({ identities: ids })}
            />
            <ContextMultiFilter
              icon={<FolderOpen className="h-3.5 w-3.5 text-slate-400" />}
              label="Project"
              allLabel="All projects"
              options={projectOptions}
              selectedIds={effectiveProjectIds}
              disabled={selectedIdentityIds.length === 0}
              onChange={(ids) => updateFilter({ projects: ids })}
            />
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Emails Processed"
          value={stats.email.total}
          icon={<Mail className="h-4 w-4" />}
          tone="brand"
          hint={emailsDetail}
          href={childLink('/demo/emails')}
        />
        <StatCard
          label="Open Tasks"
          value={stats.open}
          icon={<CheckSquare className="h-4 w-4" />}
          tone="brand"
          hint={openTasksDetail}
          href={childLink('/demo/tasks')}
        />
        <StatCard
          label={dueTitle}
          value={stats.upcoming}
          icon={<Target className="h-4 w-4" />}
          tone="warning"
          hint={dueDetail}
        />
        <StatCard
          label="Last Synced"
          value="Just now"
          icon={<Clock className="h-4 w-4" />}
          tone="brand"
          hint="Sample data"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="border-gray-200/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <PieChart className="h-4 w-4 text-brand-600" />
              Task Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <DonutChart value={stats.completionRate} size={100} color={donutColor} />
              <div className="space-y-1.5 text-sm">
                <LegendDot color="bg-success" label={`Completed: ${stats.completed}`} />
                <LegendDot color="bg-brand-600" label={`Active: ${stats.active}`} />
                <LegendDot color="bg-ai" label={`AI Suggestions: ${stats.pending}`} />
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
              <BarRow
                label="Needs Action"
                value={stats.email.needsAction}
                max={stats.email.total}
                color="bg-critical"
                href={childLink('/demo/emails', { tab: 'needs_action' })}
              />
              <BarRow
                label="Tracked"
                value={stats.email.tracked}
                max={stats.email.total}
                color="bg-brand-700"
                href={childLink('/demo/emails', { tab: 'tracked' })}
              />
              <BarRow
                label="FYI"
                value={stats.email.awareness}
                max={stats.email.total}
                color="bg-brand-400"
                href={childLink('/demo/emails', { tab: 'fyi' })}
              />
              <BarRow
                label="Ignored"
                value={stats.email.ignore}
                max={stats.email.total}
                color="bg-gray-500"
                href={childLink('/demo/emails', { tab: 'ignored' })}
              />
            </div>
            {stats.email.uncertain > 0 && (
              <Link
                href={childLink('/demo/emails', { tab: 'unclassified' })}
                className="mt-2.5 inline-flex rounded-lg border border-warning-200 bg-yellow-50/80 px-2.5 py-1.5 text-[11px] font-semibold text-warning-700 shadow-sm transition-all hover:-translate-y-px hover:bg-warning-100/70 hover:shadow-md"
              >
                +{stats.email.uncertain} needs review (uncertain or quota-skipped)
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
              <BarRow
                label="Critical"
                value={stats.priority.critical}
                max={stats.liveCount || 1}
                color="bg-critical"
                href={childLink('/demo/tasks', { priority: 'critical' })}
              />
              <BarRow
                label="High"
                value={stats.priority.high}
                max={stats.liveCount || 1}
                color="bg-orange"
                href={childLink('/demo/tasks', { priority: 'high' })}
              />
              <BarRow
                label="Medium"
                value={stats.priority.medium}
                max={stats.liveCount || 1}
                color="bg-yellow"
                href={childLink('/demo/tasks', { priority: 'medium' })}
              />
              <BarRow
                label="Low"
                value={stats.priority.low}
                max={stats.liveCount || 1}
                color="bg-gray-400"
                href={childLink('/demo/tasks', { priority: 'low' })}
              />
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2">
              <Target className="h-3.5 w-3.5 text-brand-600" />
              <span className="text-xs text-brand-700">
                AI task acceptance: <strong>Not enough decisions yet</strong>
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Completion Momentum — mirrors real CompletionMomentumCard L1308-1382 */}
      <Card className="overflow-hidden border-gray-200/80 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-brand-600" />
              Completion Momentum
            </CardTitle>
            {view === 'all' && (
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="utility" className="h-7 px-2 text-xs" onClick={() => updateMomentumWindow('previous')}>
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="utility"
                  className="h-7 px-2 text-xs"
                  onClick={() => updateMomentumWindow('next')}
                  disabled={!momentumEnd || momentumEnd >= dateKeyIso(now)}
                >
                  Next
                </Button>
                <Button size="sm" variant="utility" className="h-7 px-2 text-xs" onClick={() => updateMomentumWindow('latest')}>
                  Latest
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] lg:items-center">
            <MomentumChart data={momentum} view={view as MomentumView} />
            <div className="space-y-3">
              <div>
                <p className="text-2xl font-bold text-slate-950">{momentumTotals.completed}</p>
                <p className="text-sm font-medium text-slate-700">
                  {momentumTotals.completed === 0
                    ? 'No completed tasks yet'
                    : `task${momentumTotals.completed === 1 ? '' : 's'} completed ${period || 'overall'}`}
                </p>
              </div>
              <p className="text-xs leading-5 text-slate-500">
                {momentumTotals.completed === 0
                  ? 'Finish a task to start your streak.'
                  : view === 'all'
                    ? `${stats.allTimeCompleted} tasks completed overall.`
                    : 'Nice progress. Your workspace is moving forward.'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2">
                  <p className="text-lg font-semibold text-slate-900">{momentumTotals.created}</p>
                  <p className="text-[11px] text-slate-500">tasks created</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2">
                  <p className="text-lg font-semibold text-slate-900">{momentumTotals.actionEmails}</p>
                  <p className="text-[11px] text-slate-500">action emails</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top priority tasks */}
      <Card className="border-gray-200/80 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Top Priority Tasks</CardTitle>
            <Link
              href={childLink('/demo/tasks')}
              className="inline-flex h-7 items-center rounded-lg border border-brand-100 bg-brand-50/70 px-2.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100/70"
            >
              View all
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {topTasks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckSquare className="h-8 w-8 text-gray-200" />
              <p className="text-sm text-gray-400">No active tasks in this scope.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {topTasks.map((task) => {
                const deadline = formatDeadline(effectiveDeadline(task))
                const project = getProject(task.projectId)
                return (
                  <Link
                    key={task.id}
                    href={`/demo/tasks/${task.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200/80 bg-white p-3 transition-colors hover:border-brand-200 hover:bg-brand-50/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{task.title}</p>
                      <p className="truncate text-xs text-gray-500">
                        {project ? `${project.name} · ` : ''}
                        {task.summary}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {deadline ? (
                        <span
                          className={`text-xs ${deadline.overdue ? 'font-medium text-critical' : 'text-gray-400'}`}
                        >
                          {deadline.label}
                        </span>
                      ) : null}
                      <PriorityBadge score={task.priorityScore} />
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
