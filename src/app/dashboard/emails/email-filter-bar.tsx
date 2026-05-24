'use client'

import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/segmented-control'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { format } from 'date-fns'
import { CalendarIcon, Eye, Loader2, Search, X } from 'lucide-react'
import type { DateRange } from 'react-day-picker'

export function EmailFilterBar({
  accountFilter,
  accounts,
  calendarOpen,
  dateRange,
  handleCalendarOpenChange,
  handleDayClick,
  handleReviewModeToggle,
  manualReviewMode,
  reviewModePending,
  searchQuery,
  selectingStep,
  setAccountFilter,
  setCalendarOpen,
  setDateRange,
  setSearchQuery,
  setSelectingStep,
}: {
  accountFilter: string
  accounts: string[]
  calendarOpen: boolean
  dateRange?: DateRange
  handleCalendarOpenChange: (open: boolean) => void
  handleDayClick: (day: Date) => void
  handleReviewModeToggle: () => void
  manualReviewMode: boolean
  reviewModePending: boolean
  searchQuery: string
  selectingStep: 'from' | 'to'
  setAccountFilter: (value: string) => void
  setCalendarOpen: (open: boolean) => void
  setDateRange: (value: DateRange | undefined) => void
  setSearchQuery: (value: string) => void
  setSelectingStep: (value: 'from' | 'to') => void
}) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/90 p-3 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search emails..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-gray-200 bg-white pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1">
            <Popover open={calendarOpen} onOpenChange={handleCalendarOpenChange}>
              <PopoverTrigger
                className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-xs transition-all ${
                  dateRange?.from
                    ? 'border-brand-300 bg-brand-50 text-brand-700 shadow-sm'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-brand-200 hover:bg-brand-50/70 hover:text-brand-700'
                }`}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {dateRange?.from ? (
                  <span className="font-medium">
                    {format(dateRange.from, 'MMM d, yyyy')}
                    {dateRange.to && dateRange.to.getTime() !== dateRange.from.getTime()
                      ? ` - ${format(dateRange.to, 'MMM d, yyyy')}`
                      : ''}
                  </span>
                ) : (
                  <span>Date filter</span>
                )}
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-auto overflow-hidden rounded-2xl border border-gray-200 p-0 shadow-lg"
              >
                <div className="flex items-center justify-between border-b border-gray-100 bg-white px-4 pb-2 pt-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectingStep('from')}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        selectingStep === 'from'
                          ? 'bg-brand-600 text-white shadow-sm'
                          : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                      }`}
                    >
                      {dateRange?.from ? format(dateRange.from, 'MMM d, yyyy') : 'Start date'}
                    </button>
                    <span className="text-sm text-gray-300">to</span>
                    <button
                      onClick={() => setSelectingStep('to')}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        selectingStep === 'to'
                          ? 'bg-brand-600 text-white shadow-sm'
                          : dateRange?.to
                            ? 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                            : 'bg-gray-50 text-gray-400'
                      }`}
                    >
                      {dateRange?.to ? format(dateRange.to, 'MMM d, yyyy') : 'End date'}
                    </button>
                  </div>
                  {dateRange?.from && (
                    <button
                      onClick={() => {
                        setDateRange(undefined)
                        setSelectingStep('from')
                      }}
                      className="ml-3 text-xs font-medium text-gray-400 transition-colors hover:text-critical"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <Calendar
                  captionLayout="dropdown"
                  modifiers={{
                    range_start: dateRange?.from,
                    range_end: dateRange?.to,
                    range_middle:
                      dateRange?.from && dateRange?.to && dateRange.from.getTime() !== dateRange.to.getTime()
                        ? { after: dateRange.from, before: dateRange.to }
                        : undefined,
                    selected:
                      dateRange?.from && !dateRange?.to
                        ? dateRange.from
                        : undefined,
                  }}
                  onDayClick={handleDayClick}
                  numberOfMonths={2}
                  disabled={{ after: new Date() }}
                  startMonth={new Date(2024, 0)}
                  endMonth={new Date()}
                />
                {dateRange?.from && !dateRange?.to && (
                  <div className="flex items-center justify-between border-t border-gray-100 bg-brand-50/40 px-4 py-2">
                    <p className="text-xs text-gray-500">
                      <span className="font-medium text-gray-700">{format(dateRange.from, 'MMM d')}</span>
                      {' '}selected, now choose an end date
                    </p>
                    <button
                      onClick={() => setCalendarOpen(false)}
                      className="text-xs font-medium text-gray-400 transition-colors hover:text-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
            {dateRange?.from && (
              <button
                onClick={() => {
                  setDateRange(undefined)
                  setSelectingStep('from')
                }}
                className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                title="Clear date filter"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {accounts.length > 1 && (
            <SegmentedControl
              value={accountFilter}
              onChange={setAccountFilter}
              options={[
                { value: 'all', label: 'All' },
                ...accounts.map((account) => ({
                  value: account,
                  label: account.split('@')[1] || account,
                })),
              ]}
            />
          )}

          <div className="group/review-toggle relative">
            <button
              onClick={handleReviewModeToggle}
              disabled={reviewModePending}
              title={
                manualReviewMode
                  ? 'Manual Review is on. Switching to Auto will process Unclassified emails.'
                  : 'Auto is on. Click to switch new action emails into Manual Review.'
              }
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                manualReviewMode
                  ? 'border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100'
                  : 'border-brand-200 bg-white text-brand-600 hover:border-brand-300 hover:bg-brand-50'
              }`}
            >
              {reviewModePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              {manualReviewMode ? 'Manual Review' : 'Auto'}
            </button>
            <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 translate-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600 opacity-0 shadow-lg transition-all duration-150 group-hover/review-toggle:translate-y-0 group-hover/review-toggle:opacity-100">
              {manualReviewMode
                ? 'Manual Review is on. Switching to Auto will create tasks from emails waiting for review.'
                : 'Auto is on. Click to send future action emails to Manual Review before tasks are created.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
