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
  User,
  Zap,
  BarChart2,
} from 'lucide-react'
import { UpgradeModal } from '@/components/upgrade-modal'
import { cn } from '@/lib/utils'
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
  emailAccounts?: EmailAccount[]
}

type EmailAccount = {
  id: string
  provider: string
  email: string | null
  syncEnabled: boolean
  lastSyncAt: string | null
  reauthRequired: boolean
  reauthReason: string | null
  reauthAt: string | null
  reauthProvider: string | null
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

type QuotaStatus = {
  classify: { used: number; limit: number | null; resetAt: string }
  extract: { used: number; limit: number | null; resetAt: string }
  pasteText?: { used: number; limit: number | null; resetAt: string }
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

type SettingsSection = 'account' | 'email' | 'privacy'

const SETTINGS_SECTIONS = [
  { id: 'account' as const, label: 'Account', icon: User },
  { id: 'email' as const, label: 'Email', icon: Mail },
  { id: 'privacy' as const, label: 'Security & Privacy', icon: Shield },
]

export default function SettingsPage() {
  const { user, logout } = useAuth()
  const queryClient = useQueryClient()
  const [activeSection, setActiveSection] = useState<SettingsSection>('account')
  const [timezonePickerOpen, setTimezonePickerOpen] = useState(false)
  const [timezoneSearch, setTimezoneSearch] = useState('')
  const [upgradeOpen, setUpgradeOpen] = useState(false)
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

  const { data: quotaRes } = useQuery<{ data: QuotaStatus }>({
    queryKey: ['quota'],
    queryFn: () => fetch('/api/settings/quota').then((r) => r.json()),
    staleTime: CACHE_TIME.stats,
  })
  const quota = quotaRes?.data

  const currentUser: CurrentUser | null = meRes?.user || meRes?.data || null
  const syncData = stats?.data?.sync
  const gmailConnected = Boolean(syncData?.gmailConnected)
  const providerReauthRequired = Boolean(
    currentUser?.emailProviderReauthRequired || syncData?.providerReauthRequired
  )
  const providerReauthProvider =
    currentUser?.emailProviderReauthProvider || syncData?.providerReauthProvider || 'gmail'
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

  function renderSectionContent() {
    switch (activeSection) {
      case 'account':
        return (
          <>
            <Card className="border-white/80 bg-white/95 shadow-sm">
              <CardContent className="flex flex-col gap-4 space-y-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-2xl font-semibold text-gray-900">{user?.name || 'Your account'}</p>
                  <p className="text-sm text-gray-500">{user?.email}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge variant="outline" className="border-brand-200 bg-brand-50 text-brand-700">
                      Workspace account
                    </Badge>
                    {providerReauthRequired ? (
                      <Badge variant="outline" className="border-warning-100 bg-warning-50 text-warning-700">
                        Reconnect required
                      </Badge>
                    ) : gmailConnected ? (
                      <Badge className="bg-success-100 text-success hover:bg-success-100">Gmail connected</Badge>
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
            <PasswordCard />

            {/* Plan & Usage */}
            <Card className="border-white/80 bg-white/95 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart2 className="h-4 w-4 text-brand-700" />
                  Plan &amp; Usage
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {user?.plan === 'pro' ? (
                      <Badge className="gap-1.5 bg-brand-600 text-white hover:bg-brand-600">
                        <Zap className="h-3 w-3" />
                        Pro
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-gray-200 text-gray-600">Free</Badge>
                    )}
                    <span className="text-sm text-gray-500">
                      {user?.plan === 'pro' ? 'Unlimited access to all features' : 'Monthly usage limits apply'}
                    </span>
                  </div>
                  {user?.plan !== 'pro' && (
                    <button
                      onClick={() => setUpgradeOpen(true)}
                      className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Upgrade to Pro
                    </button>
                  )}
                </div>

                {quota && user?.plan !== 'pro' && (
                  <div className="space-y-4 rounded-2xl border border-gray-200/80 bg-gray-50/70 p-4">
                    {/* Classification quota */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Email classification</span>
                        <span className="text-sm tabular-nums text-gray-500">
                          {quota.classify.used} / {quota.classify.limit}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            quota.classify.used / quota.classify.limit! >= 0.9
                              ? 'bg-critical'
                              : quota.classify.used / quota.classify.limit! >= 0.7
                                ? 'bg-warning'
                                : 'bg-brand-500'
                          )}
                          style={{ width: `${Math.min(100, (quota.classify.used / quota.classify.limit!) * 100)}%` }}
                        />
                      </div>
                      {quota.classify.used >= quota.classify.limit! && (
                        <p className="text-xs text-critical">Limit reached. Upgrade to Pro for unlimited classification.</p>
                      )}
                    </div>

                    {/* Extract-to-task quota */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Extract to task</span>
                        <span className="text-sm tabular-nums text-gray-500">
                          {quota.extract.used} / {quota.extract.limit}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            quota.extract.used / quota.extract.limit! >= 1
                              ? 'bg-critical'
                              : quota.extract.used / quota.extract.limit! >= 0.67
                                ? 'bg-warning'
                                : 'bg-brand-500'
                          )}
                          style={{ width: `${Math.min(100, (quota.extract.used / quota.extract.limit!) * 100)}%` }}
                        />
                      </div>
                      {quota.extract.used >= quota.extract.limit! && (
                        <p className="text-xs text-critical">Limit reached. Upgrade to Pro for unlimited extractions.</p>
                      )}
                    </div>

                    {/* Paste Text quota */}
                    {quota.pasteText && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">Paste Text</span>
                          <span className="text-sm tabular-nums text-gray-500">
                            {quota.pasteText.used} / {quota.pasteText.limit}
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              quota.pasteText.used / quota.pasteText.limit! >= 1
                                ? 'bg-critical'
                                : quota.pasteText.used / quota.pasteText.limit! >= 0.67
                                  ? 'bg-warning'
                                  : 'bg-ai'
                            )}
                            style={{ width: `${Math.min(100, (quota.pasteText.used / quota.pasteText.limit!) * 100)}%` }}
                          />
                        </div>
                        {quota.pasteText.used >= quota.pasteText.limit! && (
                          <p className="text-xs text-critical">Limit reached. Upgrade to Pro for unlimited Paste Text extraction.</p>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-gray-400">
                      Resets on {new Date(quota.classify.resetAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                )}

                {user?.plan === 'pro' && (
                  <div className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600">
                      <Zap className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-brand-700">Pro plan active</p>
                      <p className="text-xs text-brand-600">All features unlocked with no usage limits.</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />

            <Card className="border-white/80 bg-white/95 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Globe className="h-4 w-4 text-brand-700" />
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
                      if (!open) setTimezoneSearch('')
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
                            className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 placeholder-gray-400 focus:border-brand-300 focus:outline-none focus:ring-1 focus:ring-brand-200"
                            placeholder="Search timezone, city, or UTC offset..."
                            value={timezoneSearch}
                            onChange={(e) => setTimezoneSearch(e.target.value)}
                          />
                          {timezoneSearch ? (
                            <Button type="button" variant="outline" size="sm" onClick={() => setTimezoneSearch('')}>
                              Clear
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      <div className="max-h-[28rem] overflow-y-auto p-3">
                        {deviceTimezone && (!timezoneSearch || getTimezoneSearchText(deviceTimezone).includes(timezoneSearch.toLowerCase())) ? (
                          <button
                            onClick={() => timezoneMutation.mutate(deviceTimezone)}
                            className="mb-3 flex w-full items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/70 px-3 py-2 text-left transition hover:bg-brand-100/70"
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                              <Globe className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-900">
                                {getTimezonePrimaryLabel(deviceTimezone)}
                              </p>
                              <p className="text-xs text-brand-700/80">
                                Detected from this device - {formatTimezoneCode(deviceTimezone)}
                              </p>
                            </div>
                            {effectiveTimezone === deviceTimezone ? <Check className="h-4 w-4 text-brand-700" /> : null}
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
                              {effectiveTimezone === timezone ? <Check className="h-4 w-4 text-brand-700" /> : null}
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
                      className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 font-medium text-brand-700 transition hover:bg-brand-100"
                    >
                      Use detected timezone
                    </button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
            <RetentionPolicyCard />
          </>
        )
      case 'email':
        return (
          <>
            <ReviewModeCard manualReviewMode={currentUser?.manualReviewMode ?? true} />
            <LinkAccountCard
              accounts={currentUser?.emailAccounts ?? []}
              providerReauthRequired={providerReauthRequired}
              providerReauthProvider={providerReauthProvider}
              providerReauthAt={syncData?.providerReauthAt ?? null}
              lastSyncAt={syncData?.lastSyncAt ?? null}
            />
            <EmailSyncWindowCard syncStartDate={currentUser?.syncStartDate ?? null} />
          </>
        )
      case 'privacy':
        return (
          <>
            <TwoFactorCard
              totpEnabled={Boolean(currentUser?.totpEnabled)}
              onDisabled={() => queryClient.invalidateQueries({ queryKey: ['auth-me'] })}
            />
            <DeviceSessionsCard
              currentSessionId={currentUser?.currentSessionId || null}
              onLogoutCurrent={() => logout()}
            />
            <Card className="border-white/80 bg-white/95 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Shield className="h-4 w-4 text-brand-700" />
                  Security & Privacy
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
          </>
        )
    }
  }

  return (
    <div className="relative">
      <aside className="absolute left-0 top-0 hidden h-full w-44 lg:block">
        <div className="sticky top-6">
          <nav>
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              Settings
            </p>
            <div className="space-y-0.5">
              {SETTINGS_SECTIONS.map((section) => {
                const Icon = section.icon
                const isActive = activeSection === section.id
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                      isActive
                        ? 'bg-gray-100 font-medium text-gray-900'
                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                    )}
                  >
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-gray-700' : 'text-gray-400')} />
                    {section.label}
                  </button>
                )
              })}
            </div>
          </nav>
        </div>
      </aside>
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          title="Settings"
          description="Manage your account, email connections, and how the pipeline syncs your inbox."
        />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = section.icon
            const isActive = activeSection === section.id
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {section.label}
              </button>
            )
          })}
        </div>
        {renderSectionContent()}
      </div>
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
          <Clock3 className="h-4 w-4 text-brand-700" />
          Email Sync Window
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-brand-100 bg-brand-50/70 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">{syncSummary.label}</p>
              <p className="mt-1 text-sm text-brand-700/80">{syncSummary.helper}</p>
            </div>
            {syncSummary.exactPreset ? (
              <Badge className="bg-white text-brand-700 hover:bg-white">Preset active</Badge>
            ) : (
              <Badge variant="outline" className="border-brand-200 bg-white/80 text-brand-700">
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
            <PopoverTrigger className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-600 transition-all hover:border-brand-200 hover:bg-brand-50/70 hover:text-brand-700">
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
              <div className="border-t border-gray-100 bg-brand-50/40 px-4 py-3">
                <p className="text-xs font-medium text-gray-900">
                  {pendingDate
                    ? `Selected start date: ${pendingDate.toLocaleDateString()}`
                    : 'Pick a start date to preview the next sync window.'}
                </p>
                <p className="mt-1 text-xs text-brand-700/80">
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
                    ? 'border-brand-300 bg-brand-600 text-white shadow-sm ring-2 ring-brand-200/70 hover:bg-brand-700'
                    : 'opacity-75 hover:opacity-100'
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
          <Mail className="h-4 w-4 text-brand-700" />
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
          <KeyRound className="h-4 w-4 text-brand-700" />
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
          <MonitorSmartphone className="h-4 w-4 text-brand-700" />
          Browsers & Devices
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-gray-200/80 bg-gray-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-gray-900">Manage where your account stays signed in</p>
            <p className="text-sm text-gray-500">
              You can stay signed in on up to 3 browsers or devices. If you reach the limit, choose one here or during sign-in to sign out.
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
                        <Badge className="bg-brand-100 text-brand-700 hover:bg-brand-100">Current device</Badge>
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
                    className="gap-2 self-start border-critical-100 text-critical-700 hover:bg-critical-50 hover:text-critical-700"
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
            <Shield className="h-4 w-4 text-brand-700" />
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
            <Shield className="h-4 w-4 text-brand-700" />
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
                  <Badge className="bg-success-100 text-success hover:bg-success-100">Enabled</Badge>
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
                className="gap-2 self-end border-critical-100 text-critical-700 hover:bg-critical-50 hover:text-critical-700 sm:self-auto"
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

const DELETE_CONFIRMATION_PHRASE = 'delete my account'

function DangerZoneCard({ onDeleted }: { onDeleted: () => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const phraseMatches =
    confirmText.trim().toLowerCase() === DELETE_CONFIRMATION_PHRASE

  function openConfirm() {
    setError('')
    setConfirmText('')
    setConfirmOpen(true)
  }

  async function handleDelete() {
    if (!phraseMatches) return
    setConfirmOpen(false)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: confirmText }),
      })
      const data = await res.json()
      if (!data.success) {
        const msg =
          typeof data.error === 'string'
            ? data.error
            : data.error?.message ?? data.error?.code ?? 'Failed to delete account'
        throw new Error(msg)
      }
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
      <Card className="border-critical-100/60 bg-white/95 shadow-sm">
        <CardHeader >
          <CardTitle className="flex items-center gap-2 text-base text-critical-700">
            <AlertTriangle className="h-4 w-4" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <InlineNotice variant="error">{error}</InlineNotice>}
          <div className="flex flex-col gap-4 rounded-2xl border border-critical-100/60 bg-critical-50/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-semibold text-gray-900">Delete this account</p>
              <p className="text-sm text-gray-500">
                Permanently removes your account and all associated data. This cannot be undone.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={openConfirm}
              disabled={loading}
              className="gap-2 self-end border-critical-100 text-critical-700 hover:bg-critical-50 hover:text-critical-700 sm:self-auto"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete account
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Typed-confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-critical-700">
              <AlertTriangle className="h-4 w-4" />
              Delete your account?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            This will permanently delete your account, all emails, tasks, and connected data.
            There is <strong>no way to undo this</strong>.
          </p>
          <div className="space-y-2 pt-1">
            <p className="text-sm text-gray-600">
              Type <strong>delete my account</strong> to confirm.
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="delete my account"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && phraseMatches) handleDelete()
              }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={loading || !phraseMatches}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Yes, delete my account'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Link Account card
// ---------------------------------------------------------------------------

function LinkAccountCard({
  accounts,
  providerReauthRequired,
  providerReauthProvider,
  providerReauthAt,
  lastSyncAt,
}: {
  accounts: EmailAccount[]
  providerReauthRequired: boolean
  providerReauthProvider: string
  providerReauthAt: string | null
  lastSyncAt: string | null
}) {
  const queryClient = useQueryClient()
  const bound = accounts.length > 0

  const disconnect = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await fetch('/api/auth/google/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      })
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
          <KeyRound className="h-4 w-4 text-brand-700" />
          Email Connections
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-gray-200/80 bg-gray-50/70 p-4">
          <div className="flex flex-col gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-900">Connected inboxes</p>
                <Badge
                  variant={bound ? 'default' : 'outline'}
                  className={bound ? 'bg-success-100 text-success hover:bg-success-100' : ''}
                >
                  {bound ? `${accounts.length} connected` : 'None connected'}
                </Badge>
                {bound && accounts.some((account) => account.reauthRequired) && (
                  <Badge
                    variant="default"
                    className="bg-warning-100 text-warning-700 hover:bg-warning-100"
                  >
                    Reconnect required
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-600">Connect one or more Gmail accounts. EmailFlow uses read-only access and keeps each email connection separate for sync and filtering.</p>
            </div>

            {accounts.length > 0 ? (
              <div className="space-y-2">
                {accounts.map((account) => {
                  const reauthRequired = account.reauthRequired || (providerReauthRequired && accounts.length === 1)
                  const syncedAt = account.lastSyncAt || lastSyncAt
                  return (
                    <div key={account.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="border-brand-200 bg-brand-50 text-brand-700">
                            Gmail
                          </Badge>
                          <span className="truncate text-sm font-medium text-gray-900">{account.email || 'Gmail account'}</span>
                          <Badge
                            variant={reauthRequired ? 'default' : account.syncEnabled ? 'outline' : 'outline'}
                            className={reauthRequired ? 'bg-warning-100 text-warning-700 hover:bg-warning-100' : account.syncEnabled ? 'border-success-100 bg-success-50 text-success' : ''}
                          >
                            {reauthRequired ? 'Reconnect required' : account.syncEnabled ? 'Sync enabled' : 'Sync off'}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-400">
                          {reauthRequired
                            ? `Last valid connection: ${account.reauthAt || providerReauthAt ? new Date(account.reauthAt || providerReauthAt || '').toLocaleString() : 'unknown'}`
                            : syncedAt
                              ? `Last synced ${new Date(syncedAt).toLocaleString()}`
                              : 'Connection is ready. Your next sync will use the current window below.'}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {reauthRequired ? (
                          <Button
                            size="sm"
                            className="gap-2"
                            onClick={() => { window.location.href = '/api/auth/google' }}
                          >
                            <Mail className="h-3.5 w-3.5" />
                            Reconnect
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 border-critical-100 text-critical-700 hover:bg-critical-50 hover:text-critical-700"
                          onClick={() => disconnect.mutate(account.id)}
                          disabled={disconnect.isPending}
                        >
                          {disconnect.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Unplug className="h-3.5 w-3.5" />
                          )}
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-5 text-sm text-gray-500">
                No email accounts connected yet.
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <a href="/api/auth/google" className="self-start">
                <Button size="sm" className="gap-2">
                  <KeyRound className="h-3.5 w-3.5" />
                  Add Gmail account
                </Button>
              </a>
              <Button size="sm" variant="outline" disabled className="gap-2">
                Outlook coming soon
              </Button>
            </div>
          </div>
        </div>

        {(providerReauthRequired || accounts.some((account) => account.reauthRequired)) && (
          <InlineNotice variant="warning">
            <p className="text-sm">
              Your {providerReauthProvider === 'outlook' ? 'Outlook' : 'Gmail'} connection can no longer refresh access.
              Reconnect it, then run sync again.
            </p>
          </InlineNotice>
        )}

        <InlineNotice variant="info">
          <p className="text-sm">
            Gmail is available now. Outlook and additional providers can use this same account list when they are added.
          </p>
        </InlineNotice>
      </CardContent>
    </Card>
  )
}
