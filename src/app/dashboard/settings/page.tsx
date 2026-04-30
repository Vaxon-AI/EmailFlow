'use client'

import { useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { useAuth } from '@/lib/use-auth'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { InlineNotice } from '@/components/inline-notice'
import { PageHeader } from '@/components/page-header'
import {
  AlertTriangle,
  CalendarIcon,
  Clock3,
  Check,
  ChevronsUpDown,
  Globe,
  KeyRound,
  Loader2,
  LogOut,
  MonitorSmartphone,
  Mail,
  Shield,
  ShieldOff,
  Trash2,
  Unplug,
} from 'lucide-react'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'
import { CACHE_TIME } from '@/lib/query-cache'
import { requestStepUp, verifyStepUp, type StepUpAction } from '@/lib/step-up-client'
import { RetentionPolicyCard } from '@/components/retention-policy-card'

type CurrentUser = {
  email?: string | null
  gmailEmail?: string | null
  name?: string | null
  syncStartDate?: string | null
  timezone?: string | null
  totpEnabled?: boolean | null
  manualReviewMode?: boolean | null
  currentSessionId?: string | null
  emailProviderReauthRequired?: boolean | null
  emailProviderReauthReason?: string | null
  emailProviderReauthAt?: string | null
  emailProviderReauthProvider?: string | null
  googleAccount?: { email: string | null } | null
}

type DeviceSession = {
  id: string
  deviceName: string
  deviceType: string
  browser: string
  os: string
  ipAddress: string
  userAgent: string
  lastActiveAt: string
  expiresAt: string
  createdAt: string
  isCurrent: boolean
}

const SYNC_PRESETS = [7, 15, 30] as const
const POPULAR_TIMEZONES = [
  'UTC',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Paris',
  'America/Los_Angeles',
  'America/New_York',
  'America/Toronto',
  'America/Caracas',
] as const
const TIMEZONE_CITY_ALIASES: Record<string, string[]> = {
  UTC: ['utc', 'gmt', 'greenwich'],
  'Australia/Sydney': ['sydney', 'nsw', 'canberra'],
  'Australia/Melbourne': ['melbourne', 'victoria'],
  'Asia/Shanghai': ['beijing', 'shanghai', 'shenzhen', 'guangzhou', 'hangzhou', 'nanjing', 'suzhou', 'china'],
  'Asia/Singapore': ['singapore'],
  'Asia/Tokyo': ['tokyo', 'osaka', 'japan'],
  'Europe/London': ['london', 'uk', 'england'],
  'Europe/Paris': ['paris', 'france'],
  'America/Los_Angeles': ['los angeles', 'la', 'san francisco', 'seattle', 'vancouver', 'pst'],
  'America/New_York': ['new york', 'nyc', 'boston', 'miami', 'washington', 'est'],
  'America/Toronto': ['toronto', 'ottawa', 'montreal', 'canada'],
  'America/Caracas': ['caracas', 'venezuela'],
  'America/Chicago': ['chicago', 'houston', 'dallas', 'austin', 'cst'],
  'America/Denver': ['denver', 'phoenix', 'mountain', 'mst'],
  'Europe/Berlin': ['berlin', 'munich', 'germany'],
  'Europe/Madrid': ['madrid', 'barcelona', 'spain'],
  'Europe/Rome': ['rome', 'milan', 'italy'],
  'Asia/Dubai': ['dubai', 'abu dhabi', 'uae'],
  'Asia/Kolkata': ['india', 'delhi', 'mumbai', 'bangalore', 'kolkata'],
  'Asia/Bangkok': ['bangkok', 'thailand'],
  'Asia/Hong_Kong': ['hong kong', 'hk'],
  'Asia/Seoul': ['seoul', 'korea'],
  'Pacific/Auckland': ['auckland', 'wellington', 'new zealand'],
}

function formatTimezoneRegion(timezone: string) {
  const region = timezone.split('/')[0] || timezone
  return region.replaceAll('_', ' ')
}

function formatTimezoneCode(timezone: string) {
  return timezone.replaceAll('_', ' / ')
}

function getTimezoneOffsetLabel(timezone: string) {
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    })
    const part = formatter.formatToParts(now).find((item) => item.type === 'timeZoneName')?.value || 'UTC'
    return part.replace('GMT', 'UTC')
  } catch {
    return 'UTC'
  }
}

function getTimezoneSearchText(timezone: string) {
  const offset = getTimezoneOffsetLabel(timezone).toLowerCase()
  const normalized = timezone.toLowerCase()
  const code = formatTimezoneCode(timezone).toLowerCase()
  const region = formatTimezoneRegion(timezone).toLowerCase()
  const aliases = (TIMEZONE_CITY_ALIASES[timezone] || []).join(' ').toLowerCase()
  return `${normalized} ${code} ${offset} ${region} ${aliases}`
}

function getTimezonePrimaryLabel(timezone: string) {
  if (timezone === 'UTC') {
    return 'UTC'
  }

  const region = timezone.split('/')[0] || timezone
  return `${formatTimezoneRegion(region)} (${getTimezoneOffsetLabel(timezone)})`
}

export default function SettingsPage() {
  const { user, logout } = useAuth()
  const queryClient = useQueryClient()
  const [timezonePickerOpen, setTimezonePickerOpen] = useState(false)
  const [timezoneSearch, setTimezoneSearch] = useState('')
  const [deviceTimezone] = useState<string | null>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || null
    } catch {
      return null
    }
  })

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => fetch('/api/stats').then((r) => r.json()),
    staleTime: CACHE_TIME.stats,
  })

  const { data: meRes } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => fetch('/api/auth/me?details=full').then((r) => r.json()),
    staleTime: CACHE_TIME.auth,
  })

  const currentUser: CurrentUser | null = meRes?.user || meRes?.data || null
  const syncData = stats?.data?.sync
  const gmailConnected = Boolean(syncData?.gmailConnected)
  const providerReauthRequired = Boolean(
    currentUser?.emailProviderReauthRequired || syncData?.providerReauthRequired
  )
  const providerReauthProvider =
    currentUser?.emailProviderReauthProvider || syncData?.providerReauthProvider || 'gmail'
  const connectedGmail = currentUser?.gmailEmail || null
  const supportedTimezones = useMemo(() => {
    if (typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl) {
      return Intl.supportedValuesOf('timeZone')
    }

    return [
      'UTC',
      'Australia/Sydney',
      'Asia/Shanghai',
      'America/Los_Angeles',
      'America/New_York',
      'Europe/London',
    ]
  }, [])

  const effectiveTimezone = currentUser?.timezone || deviceTimezone || 'UTC'
  const timezoneResults = useMemo(() => {
    const query = timezoneSearch.trim().toLowerCase()

    if (!query) {
      return POPULAR_TIMEZONES.filter((timezone) => supportedTimezones.includes(timezone))
    }

    const scored = supportedTimezones
        .map((timezone) => {
          const lower = timezone.toLowerCase()
          const label = formatTimezoneCode(timezone).toLowerCase()
          const offset = getTimezoneOffsetLabel(timezone).toLowerCase()
          const searchable = getTimezoneSearchText(timezone)
          let score = 0

        if (lower.startsWith(query)) score += 4
        if (label.startsWith(query)) score += 3
        if (lower.includes(`/${query}`)) score += 2
        if (offset.includes(query)) score += 2
        if (searchable.includes(query)) score += 1

        return { timezone, score }
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.timezone.localeCompare(b.timezone))

    return scored.slice(0, 16).map((item) => item.timezone)
  }, [supportedTimezones, timezoneSearch])

  const timezoneMutation = useMutation({
    mutationFn: async (timezone: string) => {
      const res = await fetch('/api/settings/timezone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to update timezone')
      return json
    },
    onSuccess: () => {
      toast.success('Timezone updated')
      setTimezoneSearch('')
      setTimezonePickerOpen(false)
      queryClient.invalidateQueries({ queryKey: ['auth-me'] })
    },
    onError: (err: Error) => {
      showError(err.message || 'Failed to update timezone')
    },
  })

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Settings"
        description="Manage your account, email connections, and how the pipeline syncs your inbox."
      />

      <Card className="border-white/80 bg-white/95 shadow-sm">
        <CardContent className="flex flex-col gap-4 space-y-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-2xl font-semibold text-gray-900">Hello, {user?.name || 'Your account'}!</p>
            <p className="text-sm text-gray-500">{user?.email}</p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">
                Workspace account
              </Badge>
              {providerReauthRequired ? (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                  Reconnect required
                </Badge>
              ) : gmailConnected ? (
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Gmail connected</Badge>
              ) : (
                <Badge variant="outline">Email not connected</Badge>
              )}
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={() => logout()} className="gap-2 self-start sm:self-auto">
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        </CardContent>
      </Card>

      <LinkAccountCard
        googleAccount={currentUser?.googleAccount ?? null}
        gmailConnected={gmailConnected}
        providerReauthRequired={providerReauthRequired}
        providerReauthProvider={providerReauthProvider}
        connectedGmail={connectedGmail}
        providerReauthAt={syncData?.providerReauthAt ?? null}
        lastSyncAt={syncData?.lastSyncAt ?? null}
      />

      <RetentionPolicyCard />

      <EmailSyncWindowCard syncStartDate={currentUser?.syncStartDate ?? null} />

      <ReviewModeCard manualReviewMode={currentUser?.manualReviewMode ?? true} />

      <Card className="border-white/80 bg-white/95 shadow-sm">
        <CardHeader >
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4 text-blue-700" />
            Timezone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 rounded-2xl border border-gray-200/80 bg-gray-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-semibold text-gray-900">Daily digest timezone</p>
              <p className="text-sm text-gray-500">
                Your digest generates at 20:00 in this timezone. We first detect your current device timezone, and you can search to switch it if needed.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTimezonePickerOpen(true)}
              className="min-w-64 justify-between gap-2 self-end sm:self-auto"
            >
                <span className="truncate text-left">{getTimezonePrimaryLabel(effectiveTimezone)}</span>
                <ChevronsUpDown className="h-3.5 w-3.5 text-gray-400" />
            </Button>
            <Dialog
              open={timezonePickerOpen}
              onOpenChange={(open) => {
                setTimezonePickerOpen(open)
                if (!open) {
                  setTimezoneSearch('')
                }
              }}
            >
              <DialogContent className="max-w-xl gap-0 overflow-hidden rounded-2xl border border-gray-200 p-0 shadow-xl">
                <DialogHeader className="border-b border-gray-100 px-5 py-4">
                  <DialogTitle>Choose timezone</DialogTitle>
                  <p className="mt-1 text-xs text-gray-500">
                    Search by timezone name, city alias, or UTC offset. The detected timezone from this device is highlighted first.
                  </p>
                </DialogHeader>
                <div className="border-b border-gray-100 p-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      autoFocus
                      className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
                      placeholder="Search timezone, city, or UTC offset..."
                      value={timezoneSearch}
                      onChange={(e) => setTimezoneSearch(e.target.value)}
                    />
                    {timezoneSearch ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setTimezoneSearch('')}
                      >
                        Clear
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="max-h-[28rem] overflow-y-auto p-3">
                  {deviceTimezone && (!timezoneSearch || getTimezoneSearchText(deviceTimezone).includes(timezoneSearch.toLowerCase())) ? (
                    <button
                      onClick={() => timezoneMutation.mutate(deviceTimezone)}
                      className="mb-3 flex w-full items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2 text-left transition hover:bg-blue-100/70"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                        <Globe className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-blue-900">
                          {getTimezonePrimaryLabel(deviceTimezone)}
                        </p>
                        <p className="text-xs text-blue-700/80">
                          Detected from this device - {formatTimezoneCode(deviceTimezone)}
                        </p>
                      </div>
                      {effectiveTimezone === deviceTimezone ? <Check className="h-4 w-4 text-blue-700" /> : null}
                    </button>
                  ) : null}

                  <div className="space-y-1">
                    {!timezoneSearch ? (
                      <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                        Common timezones
                      </p>
                    ) : null}
                    {timezoneResults.map((timezone) => (
                      <button
                        key={timezone}
                        onClick={() => timezoneMutation.mutate(timezone)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-gray-100"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                          <Globe className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {getTimezonePrimaryLabel(timezone)}
                          </p>
                          <p className="truncate text-xs text-gray-500">
                            {formatTimezoneCode(timezone)}
                          </p>
                        </div>
                        {effectiveTimezone === timezone ? <Check className="h-4 w-4 text-blue-700" /> : null}
                      </button>
                    ))}
                    {timezoneSearch && timezoneResults.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-gray-200 px-3 py-5 text-center text-sm text-gray-500">
                        No timezone matches. Try a city like <span className="font-medium text-gray-700">Beijing</span>, a region like <span className="font-medium text-gray-700">Australia</span>, or an offset like <span className="font-medium text-gray-700">UTC+10</span>.
                      </div>
                    ) : null}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>
              Current timezone: <span className="font-medium text-gray-700">{getTimezonePrimaryLabel(effectiveTimezone)}</span>
            </span>
            {deviceTimezone && currentUser?.timezone !== deviceTimezone ? (
              <button
                type="button"
                onClick={() => timezoneMutation.mutate(deviceTimezone)}
                className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 font-medium text-blue-700 transition hover:bg-blue-100"
              >
                Use detected timezone
              </button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <PasswordCard />

      <TwoFactorCard totpEnabled={Boolean(currentUser?.totpEnabled)} onDisabled={() => queryClient.invalidateQueries({ queryKey: ['auth-me'] })} />

      <DeviceSessionsCard currentSessionId={currentUser?.currentSessionId || null} onLogoutCurrent={() => logout()} />

      <Card className="border-white/80 bg-white/95 shadow-sm">
        <CardHeader >
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-blue-700" />
            Privacy and Data Handling
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-gray-200/70 text-sm leading-6 text-gray-500">
            <div className="pb-2.5">
              <span className="font-medium text-gray-700">Read-only access:</span>{' '}
              EmailFlow AI reads email to classify threads and extract tasks. It cannot send or delete mail.
            </div>
            <div className="py-2.5">
              <span className="font-medium text-gray-700">Processing:</span>{' '}
              Email content is processed by AI providers for classification and summarization using the safeguards configured by the product.
            </div>
            <div className="pt-2.5">
              <span className="font-medium text-gray-700">Disconnect anytime:</span>{' '}
              Disconnecting Gmail stops future sync runs. Existing tasks and stored records remain until you clear account data.
            </div>
          </div>
        </CardContent>
      </Card>
      
      <DangerZoneCard onDeleted={() => logout()} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// EmailSyncWindowCard
// ---------------------------------------------------------------------------

function EmailSyncWindowCard({ syncStartDate }: { syncStartDate: string | null }) {
  const queryClient = useQueryClient()
  const [syncPickerOpen, setSyncPickerOpen] = useState(false)
  const [pendingDate, setPendingDate] = useState<Date | undefined>()
  const [todayMs] = useState(() => Date.now())

  const currentSyncStartDate = syncStartDate ? new Date(syncStartDate) : null

  const syncSummary = (() => {
    if (!syncStartDate) {
      return { exactPreset: 7 as number | null, label: 'Last 7 days', helper: 'Default sync window for new accounts.' }
    }
    const now = new Date()
    const startDate = new Date(syncStartDate)
    const diffMs = Math.max(0, now.getTime() - startDate.getTime())
    const days = Math.max(1, Math.round(diffMs / 86400000))
    const exactPreset = SYNC_PRESETS.includes(days as (typeof SYNC_PRESETS)[number]) ? days : null
    return {
      exactPreset,
      label: exactPreset ? `Last ${exactPreset} days` : `Custom range: ${days} days`,
      helper: `Sync starts from ${startDate.toLocaleDateString()}.`,
    }
  })()

  const pendingDays = pendingDate
    ? Math.max(1, Math.round((todayMs - pendingDate.getTime()) / 86400000))
    : null

  const syncRangeMutation = useMutation({
    mutationFn: async (days: number) => {
      const res = await fetch('/api/settings/sync-range', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to update sync range')
      return json
    },
    onSuccess: () => {
      toast.success('Sync window updated')
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      queryClient.invalidateQueries({ queryKey: ['auth-me'] })
    },
    onError: (err: Error) => {
      showError(err.message || 'Failed to update sync window')
    },
  })

  return (
    <Card className="border-white/80 bg-white/95 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock3 className="h-4 w-4 text-blue-700" />
          Email Sync Window
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-900">{syncSummary.label}</p>
              <p className="mt-1 text-sm text-blue-800/80">{syncSummary.helper}</p>
            </div>
            {syncSummary.exactPreset ? (
              <Badge className="bg-white text-blue-800 hover:bg-white">Preset active</Badge>
            ) : (
              <Badge variant="outline" className="border-blue-200 bg-white/80 text-blue-800">
                Custom date in use
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900">Change sync date</p>
            <p className="text-xs text-gray-500">Quick presets are fastest. Use a custom date when you want a one-off backfill.</p>
          </div>
          <Popover
            open={syncPickerOpen}
            onOpenChange={(open) => {
              setSyncPickerOpen(open)
              if (open) {
                setPendingDate(currentSyncStartDate || undefined)
              } else {
                setPendingDate(undefined)
              }
            }}
          >
            <PopoverTrigger className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-600 transition-all hover:border-blue-200 hover:bg-blue-50/70 hover:text-blue-700">
              <CalendarIcon className="h-3.5 w-3.5" />
              Pick date
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto overflow-hidden rounded-2xl border border-gray-200 p-0 shadow-lg">
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="text-sm font-medium text-gray-900">Choose a sync start date</p>
                <p className="mt-1 text-xs text-gray-500">
                  The next sync will start from this date and pull newer email forward from there.
                </p>
              </div>
              <Calendar
                mode="single"
                selected={pendingDate}
                onSelect={setPendingDate}
                captionLayout="dropdown"
                disabled={(date) => date > new Date(todayMs) || date < new Date(todayMs - 365 * 86400000)}
              />
              <div className="border-t border-gray-100 bg-blue-50/40 px-4 py-3">
                <p className="text-xs font-medium text-blue-900">
                  {pendingDate
                    ? `Selected start date: ${pendingDate.toLocaleDateString()}`
                    : 'Pick a start date to preview the next sync window.'}
                </p>
                <p className="mt-1 text-xs text-blue-800/80">
                  {pendingDays
                    ? `This is about the last ${pendingDays} day${pendingDays === 1 ? '' : 's'} of email.`
                    : 'You can choose any date from the last 12 months.'}
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSyncPickerOpen(false)
                    setPendingDate(undefined)
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={!pendingDate || syncRangeMutation.isPending}
                  onClick={() => {
                    if (!pendingDate) return
                    const days = Math.max(1, Math.round((todayMs - pendingDate.getTime()) / 86400000))
                    syncRangeMutation.mutate(days, {
                      onSettled: () => {
                        setSyncPickerOpen(false)
                        setPendingDate(undefined)
                      },
                    })
                  }}
                >
                  {syncRangeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Apply
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {SYNC_PRESETS.map((days) => {
            const isActive = syncSummary.exactPreset === days
            return (
              <Button
                key={days}
                type="button"
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                onClick={() => syncRangeMutation.mutate(days)}
                disabled={syncRangeMutation.isPending}
                className={`transition-all duration-200 ${
                  isActive
                    ? 'scale-110 shadow-md ring-2 ring-blue-500/30'
                    : 'scale-90 opacity-60 hover:opacity-80'
                }`}
              >
                {days} days
              </Button>
            )
          })}
        </div>

        <InlineNotice variant="warning">
          <p className="text-sm">
            After you change the sync window, run sync again to pull mail from the new range.
          </p>
        </InlineNotice>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// ReviewModeCard
// ---------------------------------------------------------------------------

function ReviewModeCard({ manualReviewMode }: { manualReviewMode: boolean }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (mode: boolean) => {
      const res = await fetch('/api/settings/review-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualReviewMode: mode }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to update')
      return json
    },
    onSuccess: () => {
      toast.success('Email review mode updated')
      queryClient.invalidateQueries({ queryKey: ['auth-me'] })
    },
    onError: (err: Error) => {
      showError(err.message || 'Failed to update review mode')
    },
  })

  return (
    <Card className="border-white/80 bg-white/95 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4 text-blue-700" />
          Email Review Mode
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-4 rounded-2xl border border-gray-200/80 bg-gray-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 space-y-1">
            <p className="text-sm font-semibold text-gray-900">
              {manualReviewMode ? 'Manual Review (default)' : 'Auto Process'}
            </p>
            <p className="text-sm text-gray-500">
              {manualReviewMode
                ? 'Synced emails wait for your approval before tasks are created. A banner will appear in your inbox.'
                : 'Tasks are created automatically for every action email. Switching back to Manual will not undo existing tasks.'}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => mutation.mutate(!manualReviewMode)}
            disabled={mutation.isPending}
            className="self-end gap-2 sm:self-auto"
          >
            {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Switch to {manualReviewMode ? 'Auto' : 'Manual Review'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function PasswordCard() {
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleChangePassword() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/request-password-reset', { method: 'POST' })
      const data = await res.json()
      if (!data.success) {
        setError(data.error?.message ?? data.error ?? 'Failed to send reset email')
      } else {
        setSent(true)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-white/80 bg-white/95 shadow-sm">
      <CardHeader >
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-blue-700" />
          Change Password
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <InlineNotice variant="error">{error}</InlineNotice>}

        {sent ? (
          <InlineNotice variant="success" className="items-center">
            <div className="flex flex-1 items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Reset link sent</p>
                <p className="text-xs">Check your inbox and click the link to set a new password.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSent(false)}>
                Dismiss
              </Button>
            </div>
          </InlineNotice>
        ) : (
          <div className="flex flex-col gap-4 rounded-2xl border border-gray-200/80 bg-gray-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-semibold text-gray-900">Keep your login secure</p>
              <p className="text-sm text-gray-500">
                This flow sends a reset link to your email. Open that link to choose a new password.
              </p>
            </div>
            <Button size="sm" onClick={handleChangePassword} disabled={loading} className="self-end gap-2 sm:self-auto">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              Send reset link
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DeviceSessionsCard({
  currentSessionId,
  onLogoutCurrent,
}: {
  currentSessionId: string | null
  onLogoutCurrent: () => Promise<void>
}) {
  const queryClient = useQueryClient()

  const { data: sessionsRes, isLoading } = useQuery({
    queryKey: ['auth-sessions'],
    queryFn: async () => {
      const res = await fetch('/api/auth/sessions')
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to load sessions')
      return json
    },
    staleTime: CACHE_TIME.auth,
  })

  const sessions: DeviceSession[] = sessionsRes?.data?.sessions || []

  const revokeSessionMutation = useMutation({
    mutationFn: async (session: DeviceSession) => {
      const res = await fetch(`/api/auth/sessions/${session.id}/revoke`, {
        method: 'POST',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Failed to sign out device')
      return session
    },
    onSuccess: async (session) => {
      if (session.isCurrent || session.id === currentSessionId) {
        toast.success('Signed out from current device')
        await onLogoutCurrent()
        return
      }

      toast.success('Device signed out')
      queryClient.invalidateQueries({ queryKey: ['auth-sessions'] })
    },
    onError: (err: Error) => {
      showError(err.message || 'Failed to sign out device')
    },
  })

  const revokeOthersMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/auth/sessions/revoke-others', {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to sign out other devices')
      return json
    },
    onSuccess: (json) => {
      const count = json?.data?.revokedCount ?? 0
      toast.success(count > 0 ? `Signed out ${count} other device${count === 1 ? '' : 's'}` : 'No other active devices')
      queryClient.invalidateQueries({ queryKey: ['auth-sessions'] })
    },
    onError: (err: Error) => {
      showError(err.message || 'Failed to sign out other devices')
    },
  })

  return (
    <Card className="border-white/80 bg-white/95 shadow-sm">
      <CardHeader >
        <CardTitle className="flex items-center gap-2 text-base">
          <MonitorSmartphone className="h-4 w-4 text-blue-700" />
          Device Sessions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-gray-200/80 bg-gray-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-gray-900">Manage where your account stays signed in</p>
            <p className="text-sm text-gray-500">
              Up to 3 active sessions are kept. When a new device signs in beyond that, the least recently active one is revoked automatically.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => revokeOthersMutation.mutate()}
            disabled={revokeOthersMutation.isPending || sessions.filter((session) => !session.isCurrent).length === 0}
            className="gap-2 self-start sm:self-auto"
          >
            {revokeOthersMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
            Sign out all other devices
          </Button>
        </div>

        <div className="space-y-3">
          {isLoading ? (
            <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
              Loading active sessions...
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
              No active sessions found.
            </div>
          ) : (
            sessions.map((session) => {
              const secondary = [session.browser, session.os].filter(Boolean).join(' · ') || 'Unknown environment'

              return (
                <div
                  key={session.id}
                  className="flex flex-col gap-4 rounded-2xl border border-gray-200/80 bg-white p-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{session.deviceName || 'Unknown device'}</p>
                      {session.isCurrent ? (
                        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Current device</Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-gray-600">{secondary}</p>
                    <p className="text-xs text-gray-500">
                      Last active {formatDistanceToNow(new Date(session.lastActiveAt), { addSuffix: true })}
                    </p>
                    <p className="text-xs text-gray-400">
                      Signed in {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 self-start border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700"
                    onClick={() => revokeSessionMutation.mutate(session)}
                    disabled={revokeSessionMutation.isPending}
                  >
                    {revokeSessionMutation.isPending && revokeSessionMutation.variables?.id === session.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LogOut className="h-3.5 w-3.5" />
                    )}
                    Sign out
                  </Button>
                </div>
              )
            })
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Step-Up dialog — reusable modal for TOTP / email OTP verification
// ---------------------------------------------------------------------------

function StepUpDialog({
  open,
  action,
  method,
  onClose,
  onVerified,
}: {
  open: boolean
  action: StepUpAction
  method: 'totp' | 'email'
  onClose: () => void
  onVerified: (token: string) => void
}) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const token = await verifyStepUp(action, code.trim())
      onVerified(token)
      setCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-700" />
            Verify your identity
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <InlineNotice variant="error">{error}</InlineNotice>}
          <div className="space-y-1.5">
            <Label htmlFor="step-up-code">
              {method === 'totp'
                ? 'Enter the 6-digit code from your authenticator app'
                : 'Enter the verification code sent to your email'}
            </Label>
            <Input
              id="step-up-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              maxLength={6}
              autoComplete="one-time-code"
              inputMode="numeric"
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || code.trim().length < 4}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Verify'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// TwoFactorCard
// ---------------------------------------------------------------------------

function TwoFactorCard({ totpEnabled, onDisabled }: { totpEnabled: boolean; onDisabled: () => void }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [method, setMethod] = useState<'totp' | 'email'>('email')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleRequestDisable() {
    setError('')
    setLoading(true)
    try {
      const { method: m } = await requestStepUp('disable_totp')
      setMethod(m)
      setDialogOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start verification')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerified(token: string) {
    setDialogOpen(false)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/totp/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepUpToken: token }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error?.message ?? data.error ?? 'Failed to disable 2FA')
      toast.success('Two-factor authentication disabled')
      onDisabled()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable 2FA')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Card className="border-white/80 bg-white/95 shadow-sm">
        <CardHeader >
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-blue-700" />
            Two-Factor Authentication
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <InlineNotice variant="error">{error}</InlineNotice>}
          <div className="flex flex-col gap-4 rounded-2xl border border-gray-200/80 bg-gray-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-900">Authenticator app (TOTP)</p>
                {totpEnabled ? (
                  <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Enabled</Badge>
                ) : (
                  <Badge variant="outline">Disabled</Badge>
                )}
              </div>
              <p className="text-sm text-gray-500">
                {totpEnabled
                  ? 'Your account is protected with a time-based one-time password.'
                  : 'Add an extra layer of security with an authenticator app.'}
              </p>
            </div>
            {totpEnabled ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRequestDisable}
                disabled={loading}
                className="gap-2 self-end border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700 sm:self-auto"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />}
                Disable 2FA
              </Button>
            ) : (
              <a href="/auth/totp-setup" className="self-end sm:self-auto">
                <Button size="sm" className="gap-2">
                  <Shield className="h-3.5 w-3.5" />
                  Enable 2FA
                </Button>
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      <StepUpDialog open={dialogOpen} action="disable_totp" method={method} onClose={() => setDialogOpen(false)} onVerified={handleVerified} />
    </>
  )
}

// ---------------------------------------------------------------------------
// DangerZoneCard
// ---------------------------------------------------------------------------

function DangerZoneCard({ onDeleted }: { onDeleted: () => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [method, setMethod] = useState<'totp' | 'email'>('email')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleRequestDelete() {
    setConfirmOpen(false)
    setError('')
    setLoading(true)
    try {
      const { method: m } = await requestStepUp('delete_account')
      setMethod(m)
      setDialogOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start verification')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerified(token: string) {
    setDialogOpen(false)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepUpToken: token }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error?.message ?? data.error ?? 'Failed to delete account')
      toast.success('Account deleted')
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Card className="border-red-200/60 bg-white/95 shadow-sm">
        <CardHeader >
          <CardTitle className="flex items-center gap-2 text-base text-red-700">
            <AlertTriangle className="h-4 w-4" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <InlineNotice variant="error">{error}</InlineNotice>}
          <div className="flex flex-col gap-4 rounded-2xl border border-red-200/60 bg-red-50/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-semibold text-gray-900">Delete this account</p>
              <p className="text-sm text-gray-500">
                Permanently removes your account and all associated data. This cannot be undone.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={loading}
              className="gap-2 self-end border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700 sm:self-auto"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete account
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation dialog before step-up */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4" />
              Delete your account?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            This will permanently delete your account, all emails, tasks, and connected data.
            There is <strong>no way to undo this</strong>.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRequestDelete} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Yes, delete my account'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <StepUpDialog open={dialogOpen} action="delete_account" method={method} onClose={() => setDialogOpen(false)} onVerified={handleVerified} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Link Account card
// ---------------------------------------------------------------------------

function LinkAccountCard({
  googleAccount,
  gmailConnected,
  providerReauthRequired,
  providerReauthProvider,
  connectedGmail,
  providerReauthAt,
  lastSyncAt,
}: {
  googleAccount: { email: string | null } | null
  gmailConnected: boolean
  providerReauthRequired: boolean
  providerReauthProvider: string
  connectedGmail: string | null
  providerReauthAt: string | null
  lastSyncAt: string | null
}) {
  const queryClient = useQueryClient()
  const bound = Boolean(googleAccount)

  const disconnect = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/auth/google/disconnect', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Disconnect failed')
    },
    onSuccess: () => {
      toast.success('Google account disconnected')
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      queryClient.invalidateQueries({ queryKey: ['auth-me'] })
    },
    onError: (err: Error) => {
      showError(err.message || 'Failed to disconnect Google account')
    },
  })

  return (
    <Card className="border-white/80 bg-white/95 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-blue-700" />
          Link Account
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-gray-200/80 bg-gray-50/70 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-900">Google</p>
                <Badge
                  variant={bound ? 'default' : 'outline'}
                  className={bound ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}
                >
                  {bound ? 'Bound' : 'Not bound'}
                </Badge>
                {bound && (
                  <Badge
                    variant={providerReauthRequired || gmailConnected ? 'default' : 'outline'}
                    className={
                      providerReauthRequired
                        ? 'bg-amber-100 text-amber-800 hover:bg-amber-100'
                        : gmailConnected
                          ? 'bg-blue-100 text-blue-700 hover:bg-blue-100'
                          : ''
                    }
                  >
                    {providerReauthRequired ? 'Reconnect required' : gmailConnected ? 'Gmail syncing' : 'Gmail not syncing'}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-600">
                {bound
                  ? googleAccount?.email || 'Google account linked'
                  : 'Bind your Google/Gmail account to sign in with Google.'}
              </p>
              {bound && (
                <>
                  <p className="text-sm text-gray-600">
                    {providerReauthRequired
                      ? 'Your Gmail connection has expired. Reconnect it to resume syncing.'
                      : gmailConnected
                        ? connectedGmail || 'Connected Gmail account'
                        : 'Connect Gmail to start syncing mail.'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {providerReauthRequired
                      ? `Last valid connection: ${providerReauthAt ? new Date(providerReauthAt).toLocaleString() : 'unknown'}`
                      : lastSyncAt
                      ? `Last synced ${new Date(lastSyncAt).toLocaleString()}`
                      : gmailConnected
                        ? 'Connection is ready. Your next sync will use the current window below.'
                        : 'Read-only OAuth connection. We never send, delete, or edit your emails.'}
                  </p>
                </>
              )}
            </div>

            {providerReauthRequired ? (
              <Button
                size="sm"
                className="gap-2 self-start"
                onClick={() => { window.location.href = '/api/auth/google' }}
              >
                <Mail className="h-3.5 w-3.5" />
                Reconnect
              </Button>
            ) : bound ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 self-start border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                {disconnect.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Unplug className="h-3.5 w-3.5" />
                )}
                Disconnect Google
              </Button>
            ) : (
              <a href="/api/auth/google" className="self-start">
                <Button size="sm" className="gap-2">
                  <KeyRound className="h-3.5 w-3.5" />
                  Connect Google
                </Button>
              </a>
            )}
          </div>
        </div>

        {providerReauthRequired && (
          <InlineNotice variant="warning">
            <p className="text-sm">
              Your {providerReauthProvider === 'outlook' ? 'Outlook' : 'Gmail'} connection can no longer refresh access.
              Reconnect it, then run sync again.
            </p>
          </InlineNotice>
        )}

        <InlineNotice variant="info">
          <p className="text-sm">
            Outlook and additional providers can be added later. For now, the settings flow is optimized for one Gmail connection.
          </p>
        </InlineNotice>
      </CardContent>
    </Card>
  )
}
