'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  BarChart3,
  CheckSquare,
  Clock,
  FolderOpen,
  Loader2,
  Mail,
  PieChart,
  Target,
  TrendingUp,
  UserRound,
} from 'lucide-react'

import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { getPriorityBand, getPriorityColor, getPriorityLabel } from '@/types'
import { getEmailClassConfig } from '@/lib/email-classification'
import { useAuth } from '@/lib/use-auth'
import { CACHE_TIME } from '@/lib/query-cache'
import { toast } from 'sonner'

type DashboardTask = {
  id: string
  title: string
  summary: string
  status: string
  priorityScore?: number | null
  explicitDeadline?: string | null
  inferredDeadline?: string | null
  userSetDeadline?: string | null
}

type DashboardEmail = {
  id: string
  subject: string
  sender?: string | null
  classification?: string | null
}

type DashboardContextCount = {
  id: string
  name: string
  count: number
}

type DashboardSummary = {
  stats: {
    emails: { total: number; action: number; awareness: number; ignore: number; uncertain: number; linkedAction: number }
    tasks: { total: number; pending: number; confirmed: number; completed: number; dismissed: number }
    sync: {
      lastSyncAt?: string | null
      gmailConnected?: boolean
      providerReauthRequired?: boolean
    }
  }
  tasks: {
    confirmedPreview: DashboardTask[]
    pendingPreview: DashboardTask[]
    confirmedCount: number
    pendingCount: number
    dismissedCount: number
    priorityCounts: { critical: number; high: number; medium: number; low: number }
    upcomingCount: number
  }
  attentionEmails: DashboardEmail[]
  activeIdentities: DashboardContextCount[]
  activeProjects: DashboardContextCount[]
}

type DashboardSummaryResponse = {
  data?: DashboardSummary
}

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
  const [showSyncModal, setShowSyncModal] = useState(() => searchParams.get('gmail_connected') === '1')
  const [syncSetupLoading, setSyncSetupLoading] = useState<number | null>(null)

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

  const handleSyncSetup = useCallback(async (days: number) => {
    setSyncSetupLoading(days)
    try {
      await fetch('/api/settings/sync-range', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      })
    } finally {
      setSyncSetupLoading(null)
      setShowSyncModal(false)
      router.replace('/dashboard', { scroll: false })
    }
  }, [router])

  const handleSyncSkip = useCallback(() => {
    setShowSyncModal(false)
    router.replace('/dashboard', { scroll: false })
  }, [router])
  const { data: summaryRes, isLoading: summaryLoading } = useQuery<DashboardSummaryResponse>({
    queryKey: ['dashboard-summary'],
    queryFn: () => fetch('/api/dashboard/summary').then((r) => r.json()),
    staleTime: CACHE_TIME.stats,
    placeholderData: (prev) => prev,
  })

  const summary = summaryRes?.data
  const s = summary?.stats
  const providerReauthRequired = Boolean(s?.sync?.providerReauthRequired)

  const totalTasks = s?.tasks?.total ?? 0
  const completedTasks = s?.tasks?.completed ?? 0
  const pendingTaskCount = summary?.tasks.pendingCount ?? 0
  const confirmedTaskCount = summary?.tasks.confirmedCount ?? 0
  const dismissedTaskCount = summary?.tasks.dismissedCount ?? 0
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
  const emailData = s?.emails ?? { total: 0, action: 0, awareness: 0, ignore: 0, uncertain: 0, linkedAction: 0 }
  const actionToTask = emailData.action > 0 ? Math.round((emailData.linkedAction / emailData.action) * 100) : 0
  const confirmedTasks = summary?.tasks.confirmedPreview ?? []
  const pendingTasks = summary?.tasks.pendingPreview ?? []
  const attentionEmails = summary?.attentionEmails ?? []
  const priorityCounts = summary?.tasks.priorityCounts ?? { critical: 0, high: 0, medium: 0, low: 0 }
  const upcomingCount = summary?.tasks.upcomingCount ?? 0
  const activeIdentities = summary?.activeIdentities ?? []
  const activeProjects = summary?.activeProjects ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hi, ${user?.name?.split(' ')[0] || 'there'}`}
        description="Your email-to-task command center."
        actions={
          summaryLoading ? (
            <Skeleton className="h-9 w-28 rounded-lg" />
          ) : providerReauthRequired ? (
            <Link href="/dashboard/settings">
              <Button size="sm" variant="outline" className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100">
                Reconnect Gmail
              </Button>
            </Link>
          ) : s?.sync?.gmailConnected ? (
            <Badge className="h-9 rounded-lg bg-green-100 px-4 text-sm font-medium text-green-700 hover:bg-green-100">
              Connected
            </Badge>
          ) : (
            <a href="/api/auth/google">
              <Button size="sm">Connect Gmail</Button>
            </a>
          )
        }
      />

      {attentionEmails.length > 0 && (
        <Link href="/dashboard/emails" className="animate-fade-in-up stagger-2 block">
          <div className="flex items-center gap-3 rounded-2xl border border-red-200/80 bg-[linear-gradient(135deg,rgba(254,242,242,1)_0%,rgba(255,247,237,1)_100%)] px-4 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
            <div className="relative shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-4.5 w-4.5 text-red-600" />
              </div>
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                {attentionEmails.length}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-red-800">
                {attentionEmails.length} email{attentionEmails.length > 1 ? 's' : ''} need your attention
              </p>
              <p className="truncate text-xs text-red-600">
                {attentionEmails[0]?.subject}
                {attentionEmails.length > 1 ? ` and ${attentionEmails.length - 1} more...` : ''}
              </p>
            </div>
            <span className="shrink-0 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700">
              View
            </span>
          </div>
        </Link>
      )}

      {providerReauthRequired ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your Gmail connection has expired. Reconnect it in Settings before the next sync.
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
              icon={<Mail className="h-4 w-4 text-blue-600" />}
              detail={`${emailData.action} needs action, ${emailData.awareness} FYI`}
            />
            <StatCard
              title="Open Tasks"
              value={confirmedTaskCount + pendingTaskCount}
              icon={<CheckSquare className="h-4 w-4 text-green-600" />}
              detail={`${completedTasks} completed of ${totalTasks}`}
            />
            <StatCard
              title="Due This Week"
              value={upcomingCount}
              icon={<Target className="h-4 w-4 text-orange-500" />}
              detail="Open deadlines in 7 days"
            />
            <StatCard
              title="Last Synced"
              value={s?.sync?.lastSyncAt ? timeAgo(s.sync.lastSyncAt) : 'Never'}
              icon={<Clock className="h-4 w-4 text-gray-500" />}
              detail={s?.sync?.gmailConnected ? 'Gmail connected' : 'Not connected'}
            />
          </>
        )}
      </div>

      <div className="animate-fade-in-up stagger-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
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
                  <PieChart className="h-4 w-4 text-green-600" />
                  Task Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  <DonutChart
                    value={completionRate}
                    size={100}
                    color={completionRate >= 70 ? '#22c55e' : completionRate >= 40 ? '#f59e0b' : '#ef4444'}
                  />
                  <div className="space-y-1.5 text-sm">
                    <LegendDot color="bg-green-500" label={`Completed: ${completedTasks}`} />
                    <LegendDot color="bg-blue-500" label={`Active: ${confirmedTaskCount}`} />
                    <LegendDot color="bg-purple-500" label={`AI Suggestions: ${pendingTaskCount}`} />
                    <LegendDot color="bg-gray-300" label={`Dismissed: ${dismissedTaskCount}`} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200/80 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <BarChart3 className="h-4 w-4 text-blue-600" />
                  Email Classification
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  <BarRow label="Needs Action" value={emailData.action} max={emailData.total} color="bg-red-400" />
                  <BarRow label="FYI" value={emailData.awareness} max={emailData.total} color="bg-blue-400" />
                  <BarRow label="Uncertain" value={emailData.uncertain} max={emailData.total} color="bg-yellow-400" />
                  <BarRow label="Ignored" value={emailData.ignore} max={emailData.total} color="bg-gray-300" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200/80 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <TrendingUp className="h-4 w-4 text-orange-500" />
                  Priority Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  <BarRow label="Critical" value={priorityCounts.critical} max={totalTasks || 1} color="bg-red-500" />
                  <BarRow label="High" value={priorityCounts.high} max={totalTasks || 1} color="bg-orange-400" />
                  <BarRow label="Medium" value={priorityCounts.medium} max={totalTasks || 1} color="bg-yellow-400" />
                  <BarRow label="Low" value={priorityCounts.low} max={totalTasks || 1} color="bg-gray-300" />
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2">
                  <Target className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-xs text-blue-700">
                    AI extraction rate: <strong>{actionToTask}%</strong> of action emails with tasks
                  </span>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {(summaryLoading || activeIdentities.length > 0 || activeProjects.length > 0) && (
        <div className="animate-fade-in-up stagger-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {summaryLoading ? (
            <>
              <IdentityCardSkeleton />
              <IdentityCardSkeleton />
            </>
          ) : (
            <>
              <Card className="border-sky-200/80 bg-[linear-gradient(180deg,rgba(240,249,255,0.9)_0%,rgba(255,255,255,1)_100%)] shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100">
                      <UserRound className="h-3.5 w-3.5 text-sky-700" />
                    </span>
                    Active Identities
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {activeIdentities.length === 0 ? (
                    <p className="text-sm text-gray-400">No identity groupings yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {activeIdentities.map((identity) => (
                        <Link
                          key={identity.id}
                          href={`/dashboard/emails?identity=${identity.id}`}
                          className="flex items-center justify-between rounded-xl border border-sky-100/80 bg-white/80 px-3 py-3 shadow-sm transition-colors hover:bg-sky-50/70"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-900">{identity.name}</p>
                            <p className="text-xs text-slate-500">Role context inferred from recent matter activity</p>
                          </div>
                          <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold text-sky-700 ring-1 ring-sky-100">
                            {identity.count} active matter{identity.count !== 1 ? 's' : ''}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-violet-200/80 bg-[linear-gradient(180deg,rgba(245,243,255,0.9)_0%,rgba(255,255,255,1)_100%)] shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100">
                      <FolderOpen className="h-3.5 w-3.5 text-violet-700" />
                    </span>
                    Active Projects
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {activeProjects.length === 0 ? (
                    <p className="text-sm text-gray-400">No project groupings yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {activeProjects.map((project) => (
                        <Link
                          key={project.id}
                          href={`/dashboard/tasks?project=${project.id}`}
                          className="flex items-center justify-between rounded-xl border border-violet-100/80 bg-white/80 px-3 py-3 shadow-sm transition-colors hover:bg-violet-50/70 hover:text-violet-700"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-900">{project.name}</p>
                            <p className="text-xs text-slate-500">Recently active grouped project context</p>
                          </div>
                          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-100">
                            {project.count} active matter{project.count !== 1 ? 's' : ''}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {(summaryLoading || pendingTasks.length > 0 || attentionEmails.length > 0) && (
        <div className="animate-fade-in-up stagger-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {summaryLoading ? (
            <ListCardSkeleton />
          ) : (
            <Card className="border-purple-200/80 bg-[linear-gradient(180deg,rgba(250,245,255,0.75)_0%,rgba(255,255,255,1)_100%)] shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-100">
                      <CheckSquare className="h-3.5 w-3.5 text-purple-600" />
                    </div>
                    AI Suggestions
                    {pendingTasks.length > 0 && (
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">{pendingTasks.length}</span>
                    )}
                  </CardTitle>
                  <Link href="/dashboard/tasks" className="text-xs text-purple-600 hover:underline">View all</Link>
                </div>
              </CardHeader>
              <CardContent>
                {pendingTasks.length === 0 ? (
                  <p className="py-4 text-center text-xs text-gray-400">No AI suggestions waiting</p>
                ) : (
                  <div className="space-y-1.5">
                    {pendingTasks.map((task: DashboardTask) => {
                      const band = getPriorityBand(task.priorityScore || 0)
                      return (
                        <Link
                          key={task.id}
                          href={`/dashboard/tasks/${task.id}`}
                          className="flex items-center gap-3 rounded-lg border border-purple-100 bg-white/80 px-3 py-2.5 transition-colors hover:bg-purple-50"
                        >
                          <div className={`h-7 w-1 shrink-0 rounded-full ${
                            band === 'critical' ? 'bg-red-500' : band === 'high' ? 'bg-orange-400' : band === 'medium' ? 'bg-yellow-400' : 'bg-gray-300'
                          }`} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-900">{task.title}</p>
                            <p className="truncate text-xs text-gray-500">{task.summary}</p>
                          </div>
                          <Badge variant="outline" className={`shrink-0 text-[10px] ${getPriorityColor(band)}`}>
                            {getPriorityLabel(band)}
                          </Badge>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {summaryLoading ? (
            <ListCardSkeleton />
          ) : (
            <Card className="border-red-200/80 bg-[linear-gradient(180deg,rgba(254,242,242,0.75)_0%,rgba(255,255,255,1)_100%)] shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100">
                      <Mail className="h-3.5 w-3.5 text-red-600" />
                    </div>
                    Emails Need Attention
                    {attentionEmails.length > 0 && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">{attentionEmails.length}</span>
                    )}
                  </CardTitle>
                  <Link href="/dashboard/emails" className="text-xs text-red-600 hover:underline">View all</Link>
                </div>
              </CardHeader>
              <CardContent>
                {attentionEmails.length === 0 ? (
                  <p className="py-4 text-center text-xs text-gray-400">All caught up</p>
                ) : (
                  <div className="space-y-1.5">
                    {attentionEmails.map((email: DashboardEmail) => (
                      <Link
                        key={email.id}
                        href={`/dashboard/emails/${email.id}`}
                        className="flex items-center gap-3 rounded-lg border border-red-100 bg-white/80 px-3 py-2.5 transition-colors hover:bg-red-50"
                      >
                        <div className={`h-7 w-1 shrink-0 rounded-full ${
                          email.classification === 'action' ? 'bg-red-500' : 'bg-yellow-400'
                        }`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">{email.subject}</p>
                          <p className="truncate text-xs text-gray-500">{email.sender?.split('<')[0]?.trim()}</p>
                        </div>
                        <Badge variant="outline" className={`shrink-0 text-[10px] ${getEmailClassConfig(email.classification).color}`}>
                          {getEmailClassConfig(email.classification).label}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card className="animate-fade-in-up stagger-6 border-gray-200/80 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Top Priority Tasks</CardTitle>
            <Link href="/dashboard/tasks" className="text-sm text-blue-600 hover:underline">View all</Link>
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
          ) : confirmedTasks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckSquare className="h-8 w-8 text-gray-200" />
              <p className="text-sm text-gray-400">No active tasks yet.</p>
              <Link href="/dashboard/tasks">
                <Button variant="outline" size="sm">Open tasks</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {confirmedTasks.map((task: DashboardTask) => {
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
                          Due {new Date(task.userSetDeadline ?? task.explicitDeadline ?? task.inferredDeadline ?? '').toLocaleDateString()}
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
      {/* First-login sync setup modal */}
      <Dialog open={showSyncModal} onOpenChange={setShowSyncModal}>
        <DialogContent showCloseButton={false} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set your sync range</DialogTitle>
            <DialogDescription>
              How far back should EmailFlow pull your email? You can change this anytime in Settings.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            {([7, 15, 30] as const).map((days) => {
              const from = new Date(Date.now() - days * 86400000)
              return (
                <button
                  key={days}
                  onClick={() => handleSyncSetup(days)}
                  disabled={syncSetupLoading !== null}
                  className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-blue-200 hover:bg-blue-50/60 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Last {days} days</p>
                    <p className="text-xs text-gray-500">From {from.toLocaleDateString()}</p>
                  </div>
                  {syncSetupLoading === days ? (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-gray-200" />
                  )}
                </button>
              )
            })}
          </div>

          <button
            onClick={handleSyncSkip}
            className="text-center text-xs text-gray-400 transition-colors hover:text-gray-600"
          >
            Skip — use default (7 days)
          </button>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ========== SKELETON COMPONENTS ========== */

function DashboardPageFallback() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListCardSkeleton />
        <ListCardSkeleton />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCardSkeleton />
        <ChartCardSkeleton />
        <ChartCardSkeleton />
      </div>
    </div>
  )
}

function StatCardSkeleton() {
  return (
    <Card className="border-gray-200/80 shadow-sm">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-4 rounded-full" />
        </div>
        <Skeleton className="mt-2 h-8 w-16" />
        <Skeleton className="mt-1 h-3 w-32" />
      </CardContent>
    </Card>
  )
}

function ChartCardSkeleton() {
  return (
    <Card className="border-gray-200/80 shadow-sm">
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
        </div>
      </CardContent>
    </Card>
  )
}

function IdentityCardSkeleton() {
  return (
    <Card className="border-gray-200/80 shadow-sm">
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-36" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-3">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function ListCardSkeleton() {
  return (
    <Card className="border-gray-200/80 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-12" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5">
              <Skeleton className="h-7 w-1 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function DonutChart({ value, size, color }: { value: number; size: number; color: string }) {
  const r = (size - 12) / 2
  const circ = 2 * Math.PI * r
  const filled = (value / 100) * circ
  const half = size / 2

  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={half} cy={half} r={r} fill="none" stroke="#e5e7eb" strokeWidth={10} />
      <circle
        cx={half}
        cy={half}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={10}
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${half} ${half})`}
        className="transition-all duration-700"
      />
      <text x={half} y={half} textAnchor="middle" dominantBaseline="central" className="text-lg font-bold" fill="#1f2937">
        {value}%
      </text>
    </svg>
  )
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0

  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs text-gray-600">{label}</span>
      <div className="h-5 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-semibold text-gray-700">{value}</span>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-gray-600">{label}</span>
    </div>
  )
}

function StatCard({ title, value, icon, detail }: { title: string; value: string | number; icon: React.ReactNode; detail: string }) {
  return (
    <Card className="border-gray-200/80 shadow-sm transition-transform duration-200 hover:-translate-y-0.5">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          {icon}
        </div>
        <p className="mt-1.5 text-2xl font-bold text-gray-900">{value}</p>
        <p className="mt-0.5 text-xs text-gray-400">{detail}</p>
      </CardContent>
    </Card>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
