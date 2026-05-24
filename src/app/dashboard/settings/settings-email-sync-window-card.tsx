'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { InlineNotice } from '@/components/inline-notice'
import { CalendarIcon, Clock3, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'
import { getErrorMessage } from '@/lib/api-client'

const SYNC_PRESETS = [7, 15, 30] as const

export function EmailSyncWindowCard({ syncStartDate }: { syncStartDate: string | null }) {
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
      if (!res.ok) throw new Error(getErrorMessage(json, 'Failed to update sync range'))
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
