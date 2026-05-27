'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CalendarIcon, Check, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PersonalisationChipGroup } from '@/components/personalisation-chips'
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
import { useAuth } from '@/lib/use-auth'

const SYNC_PRESET_DAYS = [7, 15, 30] as const

type SyncPreview = {
  days: number | null
  since: string
  quotaImpactCount: number
  capped?: boolean
  quotaRemaining: number | null
  wouldExceedQuota: boolean
}

type SyncSelection =
  | { type: 'preset'; days: 7 | 15 | 30 }
  | { type: 'custom' }
  | { type: 'last-sync' }

type ServerOnboardingProfile = {
  roles: string[]
  purposes: string[]
  focusAreas: string[]
  updatedAt: string
}

export type SyncSetupReason = 'header-sync' | 'gmail-connected' | 'first-time'

interface Props {
  open: boolean
  reason: SyncSetupReason
  onOpenChange: (open: boolean) => void
  /** Called once the user has saved a sync range — provider triggers the
   *  shared syncMutation so we don't have to redirect to /dashboard?run_sync=1. */
  onSyncRangeSaved: () => void
}

export function SyncSetupModal({ open, reason, onOpenChange, onSyncRangeSaved }: Props) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // For header-sync we want to land straight on Step 2 (sync-range). For OAuth
  // first-time / first-time we keep the two-step flow.
  const initialStep: 'personalisation' | 'sync-range' =
    reason === 'header-sync' ? 'sync-range' : 'personalisation'
  const [onboardingStep, setOnboardingStep] = useState<'personalisation' | 'sync-range'>(
    initialStep,
  )

  // syncSetupLoading uses days as the value for preset buttons; -1 is the
  // sentinel for the custom-date confirm action; -2 is the sentinel for
  // "to last sync" (stale-aware preset).
  const [syncSetupLoading, setSyncSetupLoading] = useState<number | null>(null)
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined)
  const [customCalendarOpen, setCustomCalendarOpen] = useState(false)

  const [onboardingRole, setOnboardingRole] = useState<string[]>([])
  const [onboardingPurpose, setOnboardingPurpose] = useState<string[]>([])
  const [onboardingFocus, setOnboardingFocus] = useState<string[]>([])
  const onboardingHydratedRef = useRef(false)
  const localStorageMigrationAttemptedRef = useRef(false)

  const [syncSelection, setSyncSelection] = useState<SyncSelection>({ type: 'preset', days: 7 })

  // Reset to initial step every time the modal opens — re-opening via the
  // header sync button should start on sync-range, not stale step-1 state.
  useEffect(() => {
    if (open) {
      setOnboardingStep(initialStep)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only fire on transitions to open
  }, [open])

  const markSyncSetupSeen = useCallback(() => {
    fetch('/api/settings/sync-setup-seen', { method: 'POST' }).catch(() => {})
  }, [])

  // Server-backed onboarding profile. Pre-fills the modal so users see their
  // prior picks when they re-open it.
  const { data: onboardingProfileRes } = useQuery<{ data: ServerOnboardingProfile | null }>({
    queryKey: ['onboarding-profile'],
    queryFn: () => fetch('/api/settings/onboarding-profile').then((r) => r.json()),
    enabled: !!user,
    staleTime: 60_000,
  })
  const serverOnboardingProfile = onboardingProfileRes?.data ?? null

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

  // One-shot localStorage migration.
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

  const persistOnboardingProfile = useCallback(async () => {
    if (
      onboardingRole.length === 0 &&
      onboardingPurpose.length === 0 &&
      onboardingFocus.length === 0
    )
      return
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

  // Sync state — drives the "Welcome back" + stale anchor + "To your last sync" preset.
  const { data: syncStateRes } = useQuery<{
    data: { state: { kind: string; lastSyncAt?: string; daysSince?: number } }
  }>({
    queryKey: ['sync-state'],
    queryFn: () => fetch('/api/sync/state').then((r) => r.json()),
    enabled: open,
    staleTime: 30_000,
  })
  const syncState = syncStateRes?.data?.state
  const isStale = syncState?.kind === 'stale'
  const lastSyncAtIso =
    syncState?.kind === 'fresh' || syncState?.kind === 'stale' ? syncState.lastSyncAt : undefined
  const daysSinceLastSync =
    isStale && typeof syncState?.daysSince === 'number' ? syncState.daysSince : 0
  const staleAnchor: 7 | 15 | 30 =
    daysSinceLastSync < 15 ? 7 : daysSinceLastSync < 30 ? 15 : 30

  // Preset previews.
  const { data: presetPreviews, isFetching: presetPreviewsLoading } = useQuery<SyncPreview[]>({
    queryKey: ['sync-preview', 'presets'],
    queryFn: async () => {
      const responses = await Promise.all(
        SYNC_PRESET_DAYS.map((d) => fetch(`/api/sync/preview?days=${d}`).then((r) => r.json())),
      )
      return responses.map((r, i) => ({ days: SYNC_PRESET_DAYS[i], ...r.data }))
    },
    enabled: open,
    staleTime: 60_000,
  })

  const { data: customPreview, isFetching: customPreviewLoading } = useQuery<SyncPreview | null>({
    queryKey: ['sync-preview', 'custom', customStartDate?.toISOString() ?? null],
    queryFn: async () => {
      if (!customStartDate) return null
      const r = await fetch(
        `/api/sync/preview?since=${encodeURIComponent(customStartDate.toISOString())}`,
      )
      const json = await r.json()
      return { days: null, ...json.data } as SyncPreview
    },
    enabled: open && !!customStartDate,
    staleTime: 60_000,
  })

  const { data: lastSyncPreview, isFetching: lastSyncPreviewLoading } =
    useQuery<SyncPreview | null>({
      queryKey: ['sync-preview', 'last-sync', lastSyncAtIso ?? null],
      queryFn: async () => {
        if (!lastSyncAtIso) return null
        const r = await fetch(
          `/api/sync/preview?since=${encodeURIComponent(lastSyncAtIso)}`,
        )
        const json = await r.json()
        return { days: null, ...json.data } as SyncPreview
      },
      enabled: open && isStale && !!lastSyncAtIso,
      staleTime: 60_000,
    })

  // For stale users, default highlight to the stale anchor instead of the
  // recommended 7. Only switches once per modal open / syncState transition.
  useEffect(() => {
    if (!isStale) return
    setSyncSelection((prev) =>
      prev.type === 'preset' && prev.days === 7 && staleAnchor !== 7
        ? { type: 'preset', days: staleAnchor }
        : prev,
    )
  }, [isStale, staleAnchor])

  const finishSave = useCallback(
    (saved: boolean) => {
      setSyncSetupLoading(null)
      onOpenChange(false)
      if (saved) {
        // Invalidate sync-state so the header gate sees us as fresh next time.
        queryClient.invalidateQueries({ queryKey: ['sync-state'] })
        onSyncRangeSaved()
      }
    },
    [onOpenChange, onSyncRangeSaved, queryClient],
  )

  const handleSyncSetup = useCallback(
    async (days: number) => {
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
        finishSave(saved)
      }
    },
    [finishSave, markSyncSetupSeen],
  )

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
      finishSave(saved)
    }
  }, [customStartDate, finishSave, markSyncSetupSeen])

  const handleSyncToLastSync = useCallback(
    async (lastSyncIso: string) => {
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
        finishSave(saved)
      }
    },
    [finishSave, markSyncSetupSeen],
  )

  const handlePersonalisationContinue = useCallback(() => {
    void persistOnboardingProfile()
    if (
      onboardingRole.length > 0 ||
      onboardingPurpose.length > 0 ||
      onboardingFocus.length > 0
    ) {
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

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          markSyncSetupSeen()
        }
        onOpenChange(v)
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={
          onboardingStep === 'personalisation' ? 'max-w-2xl sm:max-w-2xl' : 'max-w-md sm:max-w-md'
        }
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
              {reason !== 'header-sync' && (
                <p className="text-xs font-medium tracking-wide text-brand-600">Step 2 of 2</p>
              )}
              <DialogTitle>
                {isStale ? 'Welcome back' : 'Choose your email sync range'}
              </DialogTitle>
              <DialogDescription>
                {isStale
                  ? `It's been ${daysSinceLastSync} days since your last sync. Pick a window to catch up.`
                  : 'Start with 7 days if you’re trying EmailFlow for the first time. You can sync more emails later from Settings.'}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-xl border border-warning-200 bg-warning-100/60 px-4 py-3 text-xs text-warning-700">
              <p className="font-semibold">Free plan limit</p>
              <p className="mt-0.5 text-warning">
                EmailFlow classifies up to <strong>100 emails per month</strong> on the free plan.
                If your inbox is busy, pick a smaller window so you don&apos;t hit the cap on day
                one.
              </p>
            </div>

            <div className="grid gap-2">
              {isStale ? (
                <>
                  <SyncWindowOption
                    key={staleAnchor}
                    title={`Last ${staleAnchor} days`}
                    fromDate={new Date(Date.now() - staleAnchor * 86400000)}
                    preview={presetPreviews?.find((p) => p.days === staleAnchor)}
                    loading={
                      !presetPreviews?.find((p) => p.days === staleAnchor) &&
                      presetPreviewsLoading
                    }
                    busy={syncSetupLoading === staleAnchor}
                    disabled={syncSetupLoading !== null}
                    onClick={() => setSyncSelection({ type: 'preset', days: staleAnchor })}
                    selected={
                      syncSelection.type === 'preset' && syncSelection.days === staleAnchor
                    }
                  />
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
              {reason === 'header-sync' ? (
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={handleSyncBack}
                  disabled={syncSetupLoading !== null}
                >
                  Back
                </Button>
              )}
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

  const containerClass = selected
    ? 'border-brand-500 bg-brand-50 hover:border-brand-500 hover:bg-brand-50 p-4 ring-2 ring-brand-100'
    : exceeds
      ? 'border-warning-100 bg-warning-50/50 hover:border-warning-100 hover:bg-warning-100/60 p-4'
      : recommended
        ? 'border-brand-300 bg-brand-50/40 hover:border-brand-400 hover:bg-brand-50/70 p-4 shadow-sm'
        : dim
          ? 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50/60 p-3'
          : 'border-gray-200 bg-white hover:border-brand-200 hover:bg-brand-50/60 p-4'

  const titleClass =
    dim && !exceeds && !selected
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
            {recommended && !exceeds ? (
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
            <div
              className={`h-4 w-4 rounded-full border-2 ${recommended && !exceeds ? 'border-brand-300' : 'border-gray-200'}`}
            />
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
