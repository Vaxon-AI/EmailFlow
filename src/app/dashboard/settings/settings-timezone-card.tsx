'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Globe, Check, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'
import { mutateJson } from '@/lib/api-client'

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
  if (timezone === 'UTC') return 'UTC'
  const region = timezone.split('/')[0] || timezone
  return `${formatTimezoneRegion(region)} (${getTimezoneOffsetLabel(timezone)})`
}

export function SettingsTimezoneCard({ currentTimezone }: { currentTimezone?: string | null }) {
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

  const effectiveTimezone = currentTimezone || deviceTimezone || 'UTC'
  const timezoneResults = useMemo(() => {
    const query = timezoneSearch.trim().toLowerCase()
    if (!query) {
      return POPULAR_TIMEZONES.filter((timezone) => supportedTimezones.includes(timezone))
    }

    return supportedTimezones
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
      .slice(0, 16)
      .map((item) => item.timezone)
  }, [supportedTimezones, timezoneSearch])

  const timezoneMutation = useMutation({
    mutationFn: (timezone: string) =>
      mutateJson('/api/settings/timezone', {
        body: { timezone },
        fallbackMessage: 'Failed to update timezone',
      }),
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
          {deviceTimezone && currentTimezone !== deviceTimezone ? (
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
  )
}
