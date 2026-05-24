'use client'

import { Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DashboardContextCount } from './dashboard-types'

export function ContextMultiFilter({
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
