'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  BarChart3,
  CalendarIcon,
  Check,
  CheckSquare,
  Clock,
  FolderOpen,
  Loader2,
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
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { UpgradeModal } from '@/components/upgrade-modal'
import { PersonalisationChipGroup } from '@/components/personalisation-chips'
import { getPriorityBand, getPriorityColor, getPriorityLabel } from '@/types'
import { useAuth } from '@/lib/use-auth'
import {
  ONBOARDING_FOCUS_LIMIT,
  ONBOARDING_FOCUS_OPTIONS,
  ONBOARDING_PURPOSE_LIMIT,
  ONBOARDING_PURPOSE_OPTIONS,
  ONBOARDING_ROLE_LIMIT,
  ONBOARDING_ROLE_OPTIONS,
  clearLocalStorageProfile,
  migrateLocalStorageIfPresent,
  toggleChipValue,
} from '@/lib/onboarding-profile'
import { cn } from '@/lib/utils'
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
}

type DashboardProject = {
  id: string
  name: string
  identityId: string | null
  identity: { id: string; name: string } | null
}

type DashboardStats = {
  emails: {
    total: number
    action: number
    awareness: number
    ignore: number
    uncertain: number
    linkedAction: number
    needsReview: number
    tracked: number
    unclassified?: number
  }
  tasks: { total: number; pending: number; active: number; completed: number }
  sync: {
    lastSyncAt?: string | null
    emailConnected?: boolean
    providerReauthRequired?: boolean
  }
}

type DashboardTasksSummary = {
  activePreview: DashboardTask[]
  pendingPreview: DashboardTask[]
  activeCount: number
  pendingCount: number
  priorityCounts: { critical: number; high: number; medium: number; low: number }
  upcomingCount: number
  aiAcceptance: { accepted: number; rejected: number; rate: number | null }
}

type DashboardSummary = {
  view: DashboardView
  stats: DashboardStats
  tasks: DashboardTasksSummary
  attentionEmails: DashboardEmail[]
  attentionEmailCount?: number
  momentum: Array<{
    date: string
    completedTasks: number
    createdTasks: number
    actionEmails: number
  }>
  feedback: DashboardFeedback
  allTime?: {
    stats: DashboardStats
    tasks: DashboardTasksSummary
  } | null
}

type DashboardSummaryResponse = {
  data?: DashboardSummary
}

type DashboardView = 'today' | 'week' | 'all'
type DashboardFeedback = {
  label: string
  tone: 'success' | 'info' | 'warning' | 'neutral'
  message: string
}

const UNCATEGORIZED_ID = '__uncategorized__'
const UNCATEGORIZED_OPTION = { id: UNCATEGORIZED_ID, name: 'Uncategorized' }
const DASHBOARD_VIEWS: Array<{ id: DashboardView; label: string }> = [
  { id: 'all', label: 'All Time' },
  { id: 'week', label: 'This Week' },
  { id: 'today', label: 'Today' },
]

const SYNC_PRESET_DAYS = [7, 15, 30] as const

type SyncPreview = {
  /** null for the custom-date row */
  days: number | null
  since: string
  quotaImpactCount: number
  /** True when the count hit the soft cap; UI shows "500+" */
  capped?: boolean
  quotaRemaining: number | null
  wouldExceedQuota: boolean
}

type SyncSelection =
  | { type: 'preset'; days: 7 | 15 | 30 }
  | { type: 'custom' }
  | { type: 'last-sync' }

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
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const selectedIdentityIds = useMemo(() => parseContextParam(searchParams, 'identity'), [searchParams])
  const selectedProjectIds = useMemo(() => parseContextParam(searchParams, 'project'), [searchParams])
  const selectedView = parseDashboardView(searchParams.get('view'))
  const timezoneOffset = useMemo(() => new Date().getTimezoneOffset(), [])
  const [showSyncModal, setShowSyncModal] = useState(false)
  // syncSetupLoading uses days as the value for preset buttons; -1 is the
  // sentinel for the custom-date confirm action; -2 is the sentinel for
  // "to last sync" (stale-aware preset). No real preset uses negative days.
  const [syncSetupLoading, setSyncSetupLoading] = useState<number | null>(null)
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined)
  const [customCalendarOpen, setCustomCalendarOpen] = useState(false)
  const [quotaUpgradeOpen, setQuotaUpgradeOpen] = useState(false)

  // Onboarding step state — two-step modal: personalisation → sync range.
  const [onboardingStep, setOnboardingStep] = useState<'personalisation' | 'sync-range'>('personalisation')
  const [onboardingRole, setOnboardingRole] = useState<string[]>([])
  const [onboardingPurpose, setOnboardingPurpose] = useState<string[]>([])
  const [onboardingFocus, setOnboardingFocus] = useState<string[]>([])
  // Tracks whether we've seeded the modal state from the server profile already,
  // so subsequent re-renders / refetches don't clobber the user's mid-edit picks.
  const onboardingHydratedRef = useRef(false)
  const localStorageMigrationAttemptedRef = useRef(false)
  // Defaults to the 7-day preset to match the mockup's pre-highlighted card.
  const [syncSelection, setSyncSelection] = useState<SyncSelection>({ type: 'preset', days: 7 })

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

  // Open the sync setup modal only for first-time users — OAuth callback
  // redirects them with ?gmail_connected=1 after the initial email provider link.
  useEffect(() => {
    if (searchParams.get('gmail_connected') === '1') {
      setShowSyncModal(true)
      router.replace('/dashboard', { scroll: false })
    }
  }, [searchParams, router])

  // Server-backed onboarding profile. Pre-fills the modal so users see their
  // prior picks when they re-open it (e.g. via the header sync button).
  type ServerOnboardingProfile = {
    roles: string[]
    purposes: string[]
    focusAreas: string[]
    updatedAt: string
  }
  const { data: onboardingProfileRes } = useQuery<{ data: ServerOnboardingProfile | null }>({
    queryKey: ['onboarding-profile'],
    queryFn: () => fetch('/api/settings/onboarding-profile').then((r) => r.json()),
    enabled: !!user,
    staleTime: CACHE_TIME.stats,
  })
  const serverOnboardingProfile = onboardingProfileRes?.data ?? null

  // Seed modal state from server data exactly once; ignore later refetches so
  // we don't reset the user's mid-edit picks.
  useEffect(() => {
    if (onboardingHydratedRef.current) return
    if (onboardingProfileRes === undefined) return
    onboardingHydratedRef.current = true
    if (serverOnboardingProfile) {
      setOnboardingRole(serverOnboardingProfile.roles)
      setOnboardingPurpose(serverOnboardingProfile.purposes)
      setOnboardingFocus(serverOnboardingProfile.focusAreas)
    }
  }, [onboardingProfileRes, serverOnboardingProfile])

  // One-shot localStorage migration: when the server has no profile yet but the
  // browser still holds the legacy key, POST it up then clear the legacy key.
  useEffect(() => {
    if (!user) return
    if (localStorageMigrationAttemptedRef.current) return
    if (onboardingProfileRes === undefined) return
    if (serverOnboardingProfile) return
    const legacy = migrateLocalStorageIfPresent()
    if (!legacy) return
    localStorageMigrationAttemptedRef.current = true
    void (async () => {
      const res = await fetch('/api/settings/onboarding-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(legacy),
      }).catch(() => null)
      if (res && res.ok) {
        clearLocalStorageProfile()
        queryClient.invalidateQueries({ queryKey: ['onboarding-profile'] })
      }
    })()
  }, [user, onboardingProfileRes, serverOnboardingProfile, queryClient])

  const markSyncSetupSeen = useCallback(() => {
    // Fire-and-forget — failures here only mean the user might see the dialog
    // one more time on next login, which is acceptable.
    fetch('/api/settings/sync-setup-seen', { method: 'POST' }).catch(() => {})
  }, [])

  const persistOnboardingProfile = useCallback(async () => {
    // Only persist when the user actually made selections — otherwise (Skip
    // path) leave any previously saved profile alone.
    if (onboardingRole.length === 0 && onboardingPurpose.length === 0 && onboardingFocus.length === 0) return
    try {
      const res = await fetch('/api/settings/onboarding-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: onboardingRole,
          purpose: onboardingPurpose,
          focusAreas: onboardingFocus,
        }),
      })
      if (!res.ok) {
        toast.error('Could not save preferences. They will not affect classification yet.')
        return
      }
      queryClient.invalidateQueries({ queryKey: ['onboarding-profile'] })
    } catch {
      toast.error('Could not save preferences. They will not affect classification yet.')
    }
  }, [onboardingRole, onboardingPurpose, onboardingFocus, queryClient])

  const handleSyncSetup = useCallback(async (days: number) => {
    setSyncSetupLoading(days)
    let saved = false
    try {
      const res = await fetch('/api/settings/sync-range', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      })
      saved = res.ok
      markSyncSetupSeen()
    } finally {
      setSyncSetupLoading(null)
      setShowSyncModal(false)
      router.replace(saved ? '/dashboard?run_sync=1' : '/dashboard', { scroll: false })
    }
  }, [router, markSyncSetupSeen])

  const handleCustomConfirm = useCallback(async () => {
    if (!customStartDate) return
    setSyncSetupLoading(-1)
    let saved = false
    try {
      const res = await fetch('/api/settings/sync-range', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customDate: customStartDate.toISOString() }),
      })
      saved = res.ok
      markSyncSetupSeen()
    } finally {
      setSyncSetupLoading(null)
      setShowSyncModal(false)
      router.replace(saved ? '/dashboard?run_sync=1' : '/dashboard', { scroll: false })
    }
  }, [customStartDate, router, markSyncSetupSeen])

  // Step-1 actions: Continue (save preferences + advance) and Skip
  // (advance without saving). Both land on the sync-range step.
  const handlePersonalisationContinue = useCallback(() => {
    void persistOnboardingProfile()
    if (onboardingRole.length > 0 || onboardingPurpose.length > 0 || onboardingFocus.length > 0) {
      toast.success('Your preferences have been saved. You can update them later in Settings.')
    }
    setOnboardingStep('sync-range')
  }, [persistOnboardingProfile, onboardingRole, onboardingPurpose, onboardingFocus])

  const handlePersonalisationSkip = useCallback(() => {
    setOnboardingStep('sync-range')
  }, [])

  const handleSyncBack = useCallback(() => {
    setOnboardingStep('personalisation')
  }, [])

  // Stale-aware preset: set sync window to the user's last sync moment, so we
  // pick up exactly the gap (no double-fetch, no over-fetch).
  const handleSyncToLastSync = useCallback(async (lastSyncIso: string) => {
    setSyncSetupLoading(-2)
    let saved = false
    try {
      const res = await fetch('/api/settings/sync-range', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customDate: lastSyncIso }),
      })
      saved = res.ok
      markSyncSetupSeen()
    } finally {
      setSyncSetupLoading(null)
      setShowSyncModal(false)
      router.replace(saved ? '/dashboard?run_sync=1' : '/dashboard', { scroll: false })
    }
  }, [router, markSyncSetupSeen])

  // Preview "how many emails will use your quota" for each preset, fetched
  // in parallel only while the dialog is open. resultSizeEstimate calls are
  // cheap (one call each, no body fetch) but still skip them when not needed.
  const { data: presetPreviews, isFetching: presetPreviewsLoading } = useQuery<SyncPreview[]>({
    queryKey: ['sync-preview', 'presets'],
    queryFn: async () => {
      const responses = await Promise.all(
        SYNC_PRESET_DAYS.map((d) =>
          fetch(`/api/sync/preview?days=${d}`).then((r) => r.json())
        )
      )
      return responses.map((r, i) => ({ days: SYNC_PRESET_DAYS[i], ...r.data }))
    },
    enabled: showSyncModal,
    staleTime: 60_000,
  })

  const { data: customPreview, isFetching: customPreviewLoading } = useQuery<SyncPreview | null>({
    queryKey: ['sync-preview', 'custom', customStartDate?.toISOString() ?? null],
    queryFn: async () => {
      if (!customStartDate) return null
      const r = await fetch(`/api/sync/preview?since=${encodeURIComponent(customStartDate.toISOString())}`)
      const json = await r.json()
      return { days: null, ...json.data } as SyncPreview
    },
    enabled: showSyncModal && !!customStartDate,
    staleTime: 60_000,
  })

  // Sync state classifies the user as never / fresh / stale to drive modal copy
  // and the "To your last sync" preset (only meaningful when stale).
  const { data: syncStateRes } = useQuery<{ data: { state: { kind: string; lastSyncAt?: string; daysSince?: number }; syncStartDate: string | null } }>({
    queryKey: ['sync-state'],
    queryFn: () => fetch('/api/sync/state').then((r) => r.json()),
    enabled: showSyncModal,
    staleTime: 30_000,
  })
  const syncState = syncStateRes?.data?.state
  const isStale = syncState?.kind === 'stale'
  const lastSyncAtIso = syncState?.kind === 'fresh' || syncState?.kind === 'stale' ? syncState.lastSyncAt : undefined
  const daysSinceLastSync = isStale && typeof syncState?.daysSince === 'number' ? syncState.daysSince : 0
  const staleAnchor: 7 | 15 | 30 = daysSinceLastSync < 15 ? 7 : daysSinceLastSync < 30 ? 15 : 30

  // Step-2 action — Start Sync. Dispatches to the existing preset / custom /
  // last-sync handlers based on which card the user picked. Persists the
  // onboarding profile too in case the user landed here via Skip and then
  // came Back to fill it in.
  const handleStartSync = useCallback(() => {
    void persistOnboardingProfile()
    if (syncSelection.type === 'preset') {
      handleSyncSetup(syncSelection.days)
      return
    }
    if (syncSelection.type === 'custom') {
      if (!customStartDate) return
      handleCustomConfirm()
      return
    }
    if (syncSelection.type === 'last-sync') {
      if (!lastSyncAtIso) return
      handleSyncToLastSync(lastSyncAtIso)
    }
  }, [
    syncSelection,
    customStartDate,
    lastSyncAtIso,
    handleSyncSetup,
    handleCustomConfirm,
    handleSyncToLastSync,
    persistOnboardingProfile,
  ])

  // Default the highlighted sync card to the stale anchor (15/30) instead of
  // the recommended 7 — for stale users that's the "main" card shown.
  // Only runs once per syncState transition to avoid clobbering the user's pick.
  useEffect(() => {
    if (!isStale) return
    setSyncSelection((prev) =>
      prev.type === 'preset' && prev.days === 7 && staleAnchor !== 7
        ? { type: 'preset', days: staleAnchor }
        : prev
    )
  }, [isStale, staleAnchor])

  // For stale users, fetch a preview of "from your last sync to now" alongside the anchor preset.
  const { data: lastSyncPreview, isFetching: lastSyncPreviewLoading } = useQuery<SyncPreview | null>({
    queryKey: ['sync-preview', 'last-sync', lastSyncAtIso ?? null],
    queryFn: async () => {
      if (!lastSyncAtIso) return null
      const r = await fetch(`/api/sync/preview?since=${encodeURIComponent(lastSyncAtIso)}`)
      const json = await r.json()
      return { days: null, ...json.data } as SyncPreview
    },
    enabled: showSyncModal && isStale && !!lastSyncAtIso,
    staleTime: 60_000,
  })

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

  const updateDashboardFilter = useCallback((next: { identities?: string[]; projects?: string[]; view?: DashboardView }) => {
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
    queryKey: ['dashboard-summary', selectedIdentityIds.join(','), effectiveProjectIds.join(','), selectedView, timezoneOffset],
    queryFn: () => {
      const params = new URLSearchParams()
      setMultiParam(params, 'identity', selectedIdentityIds)
      setMultiParam(params, 'project', effectiveProjectIds)
      params.set('view', selectedView)
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
    return params.toString()
  }, [effectiveProjectIds, selectedIdentityIds, selectedView])
  const dashboardLink = useCallback((path: string, params?: Record<string, string>) => {
    const next = new URLSearchParams(dashboardQuery)
    for (const [key, value] of Object.entries(params ?? {})) {
      next.set(key, value)
    }
    const query = next.toString()
    return query ? `${path}?${query}` : path
  }, [dashboardQuery])

  return (
    <div className="space-y-6">
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
                  onClick={() => setQuotaUpgradeOpen(true)}
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
                <Button size="sm" variant="outline" className="border-critical-100 bg-critical-50 text-critical-700 hover:bg-critical-100">
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

      <div className="animate-fade-in-up stagger-1 rounded-2xl border border-white/70 bg-white/90 p-3 shadow-sm backdrop-blur">
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

      <div className="animate-fade-in-up stagger-5">
        {summaryLoading ? (
          <MomentumCardSkeleton />
        ) : (
          <CompletionMomentumCard
            data={momentum}
            view={selectedView}
            feedback={summary?.feedback}
            allTimeCompletedTasks={allTimeCompletedTasks}
          />
        )}
      </div>

      <Card className="animate-fade-in-up stagger-6 border-gray-200/80 shadow-sm">
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
      {/* First-login sync setup modal — two steps: personalisation → sync range. */}
      <Dialog
        open={showSyncModal}
        onOpenChange={(v) => {
          setShowSyncModal(v)
          // Mark seen on ANY close (Escape, click-outside, etc.) so we don't
          // re-pester the user on next login. The handlers below also call
          // markSyncSetupSeen — that's fine, the API is idempotent.
          if (!v) {
            markSyncSetupSeen()
            // Reset to step 1 so re-opening starts fresh (e.g. via the header
            // sync button) — otherwise the user lands on step 2 with stale state.
            setOnboardingStep('personalisation')
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className={onboardingStep === 'personalisation' ? 'max-w-2xl sm:max-w-2xl' : 'max-w-md sm:max-w-md'}
        >
          {onboardingStep === 'personalisation' ? (
            <PersonalisationStep
              role={onboardingRole}
              purpose={onboardingPurpose}
              focusAreas={onboardingFocus}
              onToggleRole={(value) =>
                setOnboardingRole((cur) => toggleChipValue(cur, value, ONBOARDING_ROLE_LIMIT))
              }
              onTogglePurpose={(value) =>
                setOnboardingPurpose((cur) => toggleChipValue(cur, value, ONBOARDING_PURPOSE_LIMIT))
              }
              onToggleFocus={(value) =>
                setOnboardingFocus((cur) => toggleChipValue(cur, value, ONBOARDING_FOCUS_LIMIT))
              }
              onContinue={handlePersonalisationContinue}
              onSkip={handlePersonalisationSkip}
            />
          ) : (
            <>
              <DialogHeader>
                <p className="text-xs font-medium tracking-wide text-brand-600">Step 2 of 2</p>
                <DialogTitle>{isStale ? 'Welcome back' : 'Choose your email sync range'}</DialogTitle>
                <DialogDescription>
                  {isStale
                    ? `It’s been ${daysSinceLastSync} days since your last sync. Pick a window to catch up.`
                    : 'EmailFlow will scan this range and use your preferences to identify important emails and tasks.'}
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-xl border border-warning-200 bg-warning-100/60 px-4 py-3 text-xs text-warning-700">
                <p className="font-semibold">Free plan limit</p>
                <p className="mt-0.5 text-warning">
                  EmailFlow classifies up to <strong>100 emails per month</strong> on the free plan. If your inbox is busy,
                  pick a smaller window so you don&apos;t hit the cap on day one.
                </p>
              </div>

              <div className="grid gap-2">
                {isStale ? (
                  <>
                    {/* Anchor preset (7/15/30 days, picked by daysSince) */}
                    <SyncWindowOption
                      key={staleAnchor}
                      title={`Last ${staleAnchor} days`}
                      fromDate={new Date(Date.now() - staleAnchor * 86400000)}
                      preview={presetPreviews?.find((p) => p.days === staleAnchor)}
                      loading={!presetPreviews?.find((p) => p.days === staleAnchor) && presetPreviewsLoading}
                      busy={syncSetupLoading === staleAnchor}
                      disabled={syncSetupLoading !== null}
                      onClick={() => setSyncSelection({ type: 'preset', days: staleAnchor })}
                      selected={syncSelection.type === 'preset' && syncSelection.days === staleAnchor}
                    />
                    {/* "To your last sync" — fills the exact gap */}
                    {lastSyncAtIso && (
                      <SyncWindowOption
                        key="last-sync"
                        title={`To your last sync (${daysSinceLastSync} days ago)`}
                        fromDate={new Date(lastSyncAtIso)}
                        preview={lastSyncPreview ?? undefined}
                        loading={lastSyncPreviewLoading}
                        busy={syncSetupLoading === -2}
                        disabled={syncSetupLoading !== null}
                        onClick={() => setSyncSelection({ type: 'last-sync' })}
                        selected={syncSelection.type === 'last-sync'}
                      />
                    )}
                  </>
                ) : (
                  <>
                    {/* Recommended: 7 days fits the 100/month free quota for most inboxes */}
                    {(() => {
                      const days = 7
                      const from = new Date(Date.now() - days * 86400000)
                      const preview = presetPreviews?.find((p) => p.days === days)
                      return (
                        <SyncWindowOption
                          key={days}
                          title="Last 7 days"
                          fromDate={from}
                          preview={preview}
                          loading={!preview && presetPreviewsLoading}
                          busy={syncSetupLoading === days}
                          disabled={syncSetupLoading !== null}
                          onClick={() => setSyncSelection({ type: 'preset', days })}
                          recommended
                          selected={syncSelection.type === 'preset' && syncSelection.days === days}
                        />
                      )
                    })()}

                    {/* Secondary: dimmed so users notice but aren't visually pushed toward longer windows */}
                    <p className="mt-1 text-[11px] text-gray-400">Or sync more history</p>
                    {([15, 30] as const).map((days) => {
                      const from = new Date(Date.now() - days * 86400000)
                      const preview = presetPreviews?.find((p) => p.days === days)
                      return (
                        <SyncWindowOption
                          key={days}
                          title={`Last ${days} days`}
                          fromDate={from}
                          preview={preview}
                          loading={!preview && presetPreviewsLoading}
                          busy={syncSetupLoading === days}
                          disabled={syncSetupLoading !== null}
                          onClick={() => setSyncSelection({ type: 'preset', days })}
                          dim
                          selected={syncSelection.type === 'preset' && syncSelection.days === days}
                        />
                      )
                    })}
                  </>
                )}

                {/* Custom date picker — let users pick a start date instead of a preset */}
                {customStartDate ? (
                  <SyncWindowOption
                    title={`From ${format(customStartDate, 'MMM d, yyyy')}`}
                    fromDate={customStartDate}
                    preview={customPreview ?? undefined}
                    loading={customPreviewLoading}
                    busy={syncSetupLoading === -1}
                    disabled={syncSetupLoading !== null}
                    onClick={() => setSyncSelection({ type: 'custom' })}
                    variant="custom"
                    onClear={() => {
                      setCustomStartDate(undefined)
                      // If the user clears the date while it's selected, fall back
                      // to the recommended preset so Start Sync stays enabled.
                      if (syncSelection.type === 'custom') {
                        setSyncSelection({ type: 'preset', days: isStale ? staleAnchor : 7 })
                      }
                    }}
                    selected={syncSelection.type === 'custom'}
                  />
                ) : (
                  <Popover open={customCalendarOpen} onOpenChange={setCustomCalendarOpen}>
                    <PopoverTrigger
                      disabled={syncSetupLoading !== null}
                      className="flex w-full items-center justify-between rounded-xl border border-dashed border-gray-300 bg-white p-4 text-left text-sm font-semibold text-gray-900 transition-colors hover:border-brand-300 hover:bg-brand-50/40 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4 text-gray-500" />
                        Pick a start date
                      </span>
                      <span className="text-xs font-normal text-gray-500">Custom</span>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-auto overflow-hidden rounded-2xl border border-gray-200 p-0 shadow-lg"
                    >
                      <Calendar
                        mode="single"
                        captionLayout="dropdown"
                        selected={customStartDate}
                        onSelect={(d) => {
                          if (d) {
                            setCustomStartDate(d)
                            setSyncSelection({ type: 'custom' })
                            setCustomCalendarOpen(false)
                          }
                        }}
                        numberOfMonths={1}
                        disabled={{ after: new Date() }}
                        startMonth={new Date(2024, 0)}
                        endMonth={new Date()}
                      />
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={handleSyncBack}
                  disabled={syncSetupLoading !== null}
                >
                  Back
                </Button>
                <Button
                  onClick={handleStartSync}
                  disabled={
                    syncSetupLoading !== null ||
                    (syncSelection.type === 'custom' && !customStartDate)
                  }
                >
                  {syncSetupLoading !== null ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Starting…
                    </>
                  ) : (
                    'Start Sync'
                  )}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <UpgradeModal open={quotaUpgradeOpen} onOpenChange={setQuotaUpgradeOpen} />
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

function MomentumCardSkeleton() {
  return (
    <Card className="border-gray-200/80 shadow-sm">
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-44" />
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] lg:items-end">
          <Skeleton className="h-44 w-full rounded-xl" />
          <div className="space-y-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 w-40" />
          </div>
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

function CompletionMomentumCard({
  data,
  view,
  feedback,
  allTimeCompletedTasks,
}: {
  data: Array<{ date: string; completedTasks: number; createdTasks: number; actionEmails: number }>
  view: DashboardView
  feedback?: DashboardFeedback
  allTimeCompletedTasks: number
}) {
  const totalCompleted = data.reduce((sum, day) => sum + day.completedTasks, 0)
  const totalCreated = data.reduce((sum, day) => sum + day.createdTasks, 0)
  const totalActionEmails = data.reduce((sum, day) => sum + day.actionEmails, 0)
  const periodLabel = getMomentumPeriodLabel(view)
  const statusClass = getFeedbackStatusClass(feedback?.tone ?? 'neutral')

  return (
    <Card className="overflow-hidden border-gray-200/80 bg-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <TrendingUp className="h-4 w-4 text-brand-600" />
          Completion Momentum
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] lg:items-center">
          {view === 'today' ? (
            <TodayMomentumSummary completed={totalCompleted} created={totalCreated} actionEmails={totalActionEmails} />
          ) : (
            <MomentumChart data={data} view={view} />
          )}
          <div className="space-y-3">
            {feedback ? (
              <div className={`rounded-xl border px-3 py-3 ${statusClass.wrapper}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-xl font-bold leading-tight ${statusClass.title}`}>{feedback.label}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass.badge}`}>
                    {getViewLabel(view)}
                  </span>
                </div>
                <p className={`mt-1 text-xs leading-5 ${statusClass.message}`}>{feedback.message}</p>
              </div>
            ) : null}
            <div>
              <p className="text-2xl font-bold text-slate-950">{totalCompleted}</p>
              <p className="text-sm font-medium text-slate-700">
                {totalCompleted === 0
                  ? 'No completed tasks yet'
                  : `task${totalCompleted === 1 ? '' : 's'} completed ${periodLabel}`}
              </p>
            </div>
            <p className="text-xs leading-5 text-slate-500">
              {totalCompleted === 0
                ? 'Finish a task to start your streak.'
                : view === 'all'
                  ? `${allTimeCompletedTasks} tasks completed overall.`
                  : 'Nice progress. Your workspace is moving forward.'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2">
                <p className="text-lg font-semibold text-slate-900">{totalCreated}</p>
                <p className="text-[11px] text-slate-500">tasks created</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2">
                <p className="text-lg font-semibold text-slate-900">{totalActionEmails}</p>
                <p className="text-[11px] text-slate-500">action emails</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TodayMomentumSummary({
  completed,
  created,
  actionEmails,
}: {
  completed: number
  created: number
  actionEmails: number
}) {
  return (
    <div className="grid min-h-52 gap-3 rounded-xl border border-gray-200 bg-white/80 p-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
      <div className="flex flex-col justify-between rounded-xl bg-brand-50 px-4 py-3">
        <span className="text-xs font-medium text-brand-700">Completed today</span>
        <span className="mt-5 text-3xl font-bold text-brand-700">{completed}</span>
      </div>
      <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
        <span className="text-xs font-medium text-slate-500">Tasks created</span>
        <span className="mt-5 text-3xl font-bold text-slate-900">{created}</span>
      </div>
      <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
        <span className="text-xs font-medium text-slate-500">Action emails</span>
        <span className="mt-5 text-3xl font-bold text-slate-900">{actionEmails}</span>
      </div>
    </div>
  )
}

function MomentumChart({
  data,
  view,
}: {
  data: Array<{ date: string; completedTasks: number; createdTasks: number; actionEmails: number }>
  view: DashboardView
}) {
  const width = 640
  const height = 190
  const padding = { top: 18, right: 22, bottom: 34, left: 28 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const maxCompleted = Math.max(1, ...data.map((day) => day.completedTasks))
  const points = data.map((day, index) => {
    const x = padding.left + (data.length <= 1 ? 0 : (index / (data.length - 1)) * chartWidth)
    const y = padding.top + chartHeight - (day.completedTasks / maxCompleted) * chartHeight
    return { ...day, x, y }
  })
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`
      : ''
  const xLabels = points.filter((_, index) => index === 0 || index === Math.floor(points.length / 2) || index === points.length - 1)
  const yGrid = [0, 0.5, 1]

  return (
    <div className="rounded-xl border border-gray-200 bg-white/80 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Completed tasks ${getMomentumPeriodLabel(view)}`} className="h-52 w-full">
        <defs>
          <linearGradient id="momentum-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2A47C8" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#2A47C8" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {yGrid.map((ratio) => {
          const y = padding.top + chartHeight - ratio * chartHeight
          return (
            <line key={ratio} x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 6" />
          )
        })}
        {areaPath ? <path d={areaPath} fill="url(#momentum-fill)" /> : null}
        {linePath ? <path d={linePath} fill="none" stroke="#2A47C8" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" /> : null}
        {points.map((point) => (
          <g key={point.date} className="group outline-none" tabIndex={0}>
            <circle cx={point.x} cy={point.y} r="4" fill="#2A47C8" stroke="white" strokeWidth="2" />
            <circle cx={point.x} cy={point.y} r="12" fill="transparent" />
            <g className="pointer-events-none opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
              <rect x={Math.min(width - 150, Math.max(8, point.x - 68))} y={Math.max(8, point.y - 58)} width="136" height="44" rx="8" fill="#0f172a" />
              <text x={Math.min(width - 82, Math.max(76, point.x))} y={Math.max(26, point.y - 38)} textAnchor="middle" className="fill-white text-[11px] font-semibold">
                {formatMomentumDate(point.date)}
              </text>
              <text x={Math.min(width - 82, Math.max(76, point.x))} y={Math.max(42, point.y - 22)} textAnchor="middle" className="fill-slate-200 text-[10px]">
                {point.completedTasks} done / {point.createdTasks} new / {point.actionEmails} emails
              </text>
            </g>
          </g>
        ))}
        {xLabels.map((point) => (
          <text key={`label-${point.date}`} x={point.x} y={height - 10} textAnchor="middle" className="fill-slate-400 text-[10px]">
            {formatMomentumDate(point.date)}
          </text>
        ))}
      </svg>
    </div>
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

function BarRow({ label, value, max, color, href }: { label: string; value: number; max: number; color: string; href?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0

  const content = (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs text-gray-600">{label}</span>
      <div className="h-5 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-semibold text-gray-700">{value}</span>
    </div>
  )

  if (!href) return content

  return (
    <Link href={href} className="block rounded-md transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
      {content}
    </Link>
  )
}

function ContextMultiFilter({
  icon,
  label,
  allLabel,
  options,
  selectedIds,
  disabled,
  onChange,
}: {
  icon: React.ReactNode
  label: string
  allLabel: string
  options: DashboardContextCount[]
  selectedIds: string[]
  disabled?: boolean
  onChange: (ids: string[]) => void
}) {
  const selectedSet = new Set(selectedIds)
  const selectedNames = options.filter((option) => selectedSet.has(option.id)).map((option) => option.name)
  const triggerText =
    selectedNames.length === 0
      ? 'All'
      : selectedNames.length === 1
        ? selectedNames[0]
        : `${selectedNames.length} selected`

  const toggle = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((selectedId) => selectedId !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        disabled={disabled}
        className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-input bg-white px-2.5 text-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-56"
      >
        <span className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="shrink-0 text-xs font-medium text-slate-500">{label}</span>
          <span className="truncate text-slate-900">{disabled ? 'Select identity first' : triggerText}</span>
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
        <button
          type="button"
          onClick={() => onChange([])}
          className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-slate-50"
        >
          <span className="font-medium text-slate-900">{allLabel}</span>
          {selectedIds.length === 0 ? <Check className="h-4 w-4 text-brand-600" /> : null}
        </button>
        <div className="max-h-64 overflow-y-auto">
          {options.length === 0 ? (
            <p className="px-2.5 py-3 text-sm text-slate-400">No related {label.toLowerCase()}s yet.</p>
          ) : (
            options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => toggle(option.id)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-slate-50"
              >
                <span className="truncate text-slate-700">{option.name}</span>
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selectedSet.has(option.id) ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white'}`}>
                  {selectedSet.has(option.id) ? <Check className="h-3 w-3" /> : null}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
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

function PersonalisationStep({
  role,
  purpose,
  focusAreas,
  onToggleRole,
  onTogglePurpose,
  onToggleFocus,
  onContinue,
  onSkip,
}: {
  role: string[]
  purpose: string[]
  focusAreas: string[]
  onToggleRole: (value: string) => void
  onTogglePurpose: (value: string) => void
  onToggleFocus: (value: string) => void
  onContinue: () => void
  onSkip: () => void
}) {
  return (
    <>
      <DialogHeader>
        <h1 className="text-xl font-semibold text-gray-900">Let&apos;s set up your workspace!</h1>
        <p className="text-xs font-medium tracking-wide text-brand-600">Step 1 of 2</p>
        <DialogTitle>Help EmailFlow understand your priorities</DialogTitle>
        <DialogDescription>
          These choices help AI classify emails and generate more relevant tasks.
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
        <PersonalisationChipGroup
          title="What best describes your current context?"
          hint={`Choose up to ${ONBOARDING_ROLE_LIMIT} if you use EmailFlow across different roles.`}
          options={ONBOARDING_ROLE_OPTIONS}
          selected={role}
          limit={ONBOARDING_ROLE_LIMIT}
          onToggle={onToggleRole}
        />
        <PersonalisationChipGroup
          title="What will you mainly use EmailFlow for?"
          hint={`Choose up to ${ONBOARDING_PURPOSE_LIMIT}.`}
          options={ONBOARDING_PURPOSE_OPTIONS}
          selected={purpose}
          limit={ONBOARDING_PURPOSE_LIMIT}
          onToggle={onTogglePurpose}
        />
        <PersonalisationChipGroup
          title="What should EmailFlow pay attention to?"
          hint={`Choose up to ${ONBOARDING_FOCUS_LIMIT}.`}
          options={ONBOARDING_FOCUS_OPTIONS}
          selected={focusAreas}
          limit={ONBOARDING_FOCUS_LIMIT}
          onToggle={onToggleFocus}
        />
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-gray-500 underline-offset-2 transition-colors hover:text-gray-800 hover:underline"
        >
          Skip for now
        </button>
        <Button onClick={onContinue}>Continue</Button>
      </div>
    </>
  )
}

function SyncWindowOption({
  title,
  fromDate,
  preview,
  loading,
  busy,
  disabled,
  onClick,
  variant,
  onClear,
  recommended,
  dim,
  selected,
}: {
  title: string
  fromDate: Date
  preview?: SyncPreview
  loading: boolean
  busy: boolean
  disabled: boolean
  onClick: () => void
  variant?: 'preset' | 'custom'
  onClear?: () => void
  recommended?: boolean
  dim?: boolean
  selected?: boolean
}) {
  const exceeds = preview?.wouldExceedQuota ?? false

  const countLabel = preview
    ? `~${preview.quotaImpactCount}${preview.capped ? '+' : ''} email${preview.quotaImpactCount === 1 && !preview.capped ? '' : 's'} will use your quota`
    : ''
  const detail = loading
    ? 'Estimating…'
    : preview
      ? `From ${format(fromDate, 'MMM d')} · ${countLabel}`
      : `From ${format(fromDate, 'MMM d')}`

  // Visual hierarchy: selected > exceeds > recommended > dim > default. The
  // active selection always wins so the user can see which card the
  // "Start Sync" button will act on.
  const containerClass = selected
    ? 'border-brand-500 bg-brand-50 hover:border-brand-500 hover:bg-brand-50 p-4 ring-2 ring-brand-100'
    : exceeds
      ? 'border-warning-100 bg-warning-50/50 hover:border-warning-100 hover:bg-warning-100/60 p-4'
      : recommended
        ? 'border-brand-300 bg-brand-50/40 hover:border-brand-400 hover:bg-brand-50/70 p-4 shadow-sm'
        : dim
          ? 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50/60 p-3'
          : 'border-gray-200 bg-white hover:border-brand-200 hover:bg-brand-50/60 p-4'

  const titleClass = dim && !exceeds && !selected
    ? 'flex items-center gap-2 text-[13px] font-medium text-gray-700'
    : 'flex items-center gap-2 text-sm font-semibold text-gray-900'

  return (
    <div className="space-y-1">
      <button
        onClick={onClick}
        disabled={disabled}
        className={`flex w-full items-center justify-between rounded-xl border text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${containerClass}`}
      >
        <div className="min-w-0 flex-1">
          <p className={titleClass}>
            {title}
            {recommended && !exceeds && !selected ? (
              <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Recommended
              </span>
            ) : null}
            {exceeds ? <AlertTriangle className="h-3.5 w-3.5 text-warning" /> : null}
          </p>
          <p className="truncate text-xs text-gray-500">{detail}</p>
          {exceeds ? (
            <p className="mt-0.5 text-[11px] text-warning-700">
              Exceeds free plan limit (100/month) — upgrade or pick a smaller window.
            </p>
          ) : null}
        </div>
        <div className="ml-3 flex shrink-0 items-center gap-2">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
          ) : selected ? (
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-600">
              <Check className="h-3 w-3 text-white" strokeWidth={3} />
            </div>
          ) : variant === 'custom' ? (
            <Check className="h-4 w-4 text-brand-600" />
          ) : (
            <div className={`h-4 w-4 rounded-full border-2 ${recommended && !exceeds ? 'border-brand-300' : 'border-gray-200'}`} />
          )}
        </div>
      </button>
      {onClear && !busy ? (
        <button
          onClick={onClear}
          className="ml-1 text-[11px] text-gray-400 transition-colors hover:text-gray-600"
        >
          Pick a different date
        </button>
      ) : null}
    </div>
  )
}

function StatCard({ title, value, icon, detail, href }: { title: string; value: string | number; icon: React.ReactNode; detail: string; href?: string }) {
  const card = (
    <Card className={`border-gray-200/80 shadow-sm transition-all duration-200 ${href ? 'hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md' : ''}`}>
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

  if (!href) return card

  return (
    <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
      {card}
    </Link>
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

function parseContextParam(params: URLSearchParams, key: string) {
  return params
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean)
}

function parseDashboardView(value: string | null): DashboardView {
  return value === 'today' || value === 'week' ? value : 'all'
}

function setMultiParam(params: URLSearchParams, key: string, values: string[]) {
  params.delete(key)
  if (values.length > 0) params.set(key, values.join(','))
}

function getViewLabel(view: DashboardView) {
  return DASHBOARD_VIEWS.find((item) => item.id === view)?.label ?? 'All Time'
}

function getViewPeriodLabel(view: DashboardView) {
  if (view === 'today') return 'Today'
  if (view === 'week') return 'This week'
  return 'All time'
}

function getMomentumPeriodLabel(view: DashboardView) {
  if (view === 'today') return 'today'
  if (view === 'week') return 'this week'
  return 'in the last 14 days'
}

function getFeedbackStatusClass(tone: DashboardFeedback['tone']) {
  if (tone === 'success') {
    return {
      wrapper: 'border-success-100 bg-success-50',
      title: 'text-success',
      message: 'text-success',
      badge: 'bg-white/80 text-success',
    }
  }
  if (tone === 'info') {
    return {
      wrapper: 'border-brand-100 bg-brand-50',
      title: 'text-brand-700',
      message: 'text-brand-700',
      badge: 'bg-white/80 text-brand-700',
    }
  }
  if (tone === 'warning') {
    return {
      wrapper: 'border-warning-200 bg-warning-100/60',
      title: 'text-warning-700',
      message: 'text-warning',
      badge: 'bg-white/80 text-warning',
    }
  }
  return {
    wrapper: 'border-slate-200 bg-slate-50',
    title: 'text-slate-950',
    message: 'text-slate-600',
    badge: 'bg-white text-slate-600',
  }
}

function formatMomentumDate(date: string) {
  const [, month, day] = date.split('-')
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${monthLabels[Math.max(0, Number(month) - 1)]} ${Number(day)}`
}
