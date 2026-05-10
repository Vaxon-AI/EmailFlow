'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const MONTH_OPTIONS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

type MonthYearPanelProps = {
  value: Date
  onChange: (date: Date) => void
  minYear?: number
  maxYear?: number
}

export function MonthYearPanel({
  value,
  onChange,
  minYear = new Date().getFullYear() - 5,
  maxYear = new Date().getFullYear() + 3,
}: MonthYearPanelProps) {
  const [view, setView] = useState<'months' | 'years'>('months')
  const [yearPageStart, setYearPageStart] = useState(() => value.getFullYear() - 5)

  const activeYear = value.getFullYear()
  const activeMonth = value.getMonth()

  const years = useMemo(
    () => Array.from({ length: 12 }, (_, index) => yearPageStart + index),
    [yearPageStart]
  )

  const showPreviousYears = yearPageStart > minYear
  const showNextYears = yearPageStart + 11 < maxYear

  const updateMonth = (monthIndex: number) => {
    onChange(new Date(activeYear, monthIndex, 1))
  }

  const updateYear = (year: number) => {
    onChange(new Date(year, activeMonth, 1))
    setView('months')
  }

  return (
    <div className="w-[288px] rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        {view === 'months' ? (
          <>
            <button
              type="button"
              onClick={() => onChange(new Date(activeYear - 1, activeMonth, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-700"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setYearPageStart(activeYear - 5)
                setView('years')
              }}
              className="rounded-lg px-3 py-1 text-sm font-semibold text-gray-900 transition-colors hover:bg-brand-50 hover:text-brand-700"
            >
              {activeYear}
            </button>
            <button
              type="button"
              onClick={() => onChange(new Date(activeYear + 1, activeMonth, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-700"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setYearPageStart((prev) => Math.max(prev - 12, minYear))}
              disabled={!showPreviousYears}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView('months')}
              className="rounded-lg px-3 py-1 text-sm font-semibold text-gray-900 transition-colors hover:bg-brand-50 hover:text-brand-700"
            >
              {yearPageStart} - {yearPageStart + 11}
            </button>
            <button
              type="button"
              onClick={() => setYearPageStart((prev) => Math.min(prev + 12, maxYear - 11))}
              disabled={!showNextYears}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {view === 'months' ? (
        <div className="grid grid-cols-3 gap-2">
          {MONTH_OPTIONS.map((monthName, index) => {
            const active = index === activeMonth
            return (
              <button
                key={monthName}
                type="button"
                onClick={() => updateMonth(index)}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-brand-300 bg-brand-100 text-brand-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700'
                }`}
              >
                {monthName.slice(0, 3)}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {years.map((year) => {
            const active = year === activeYear
            return (
              <button
                key={year}
                type="button"
                onClick={() => updateYear(year)}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-brand-300 bg-brand-100 text-brand-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700'
                }`}
              >
                {year}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
