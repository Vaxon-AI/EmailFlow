'use client'

import { cn } from '@/lib/utils'

// One question's worth of selectable chips. Shared between the onboarding
// modal and the Settings → Account preferences card so the visuals stay in
// sync — both surfaces use the same "selected up to N" pattern.
export function PersonalisationChipGroup({
  title,
  hint,
  options,
  selected,
  limit,
  onToggle,
}: {
  title: string
  hint: string
  options: readonly string[]
  selected: string[]
  limit: number
  onToggle: (value: string) => void
}) {
  const atCap = selected.length >= limit
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500">{hint}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option)
          const disabled = !isSelected && atCap
          return (
            <button
              key={option}
              type="button"
              onClick={() => onToggle(option)}
              disabled={disabled}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                'disabled:cursor-not-allowed disabled:opacity-50',
                isSelected
                  ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-brand-300 hover:bg-brand-50/40'
              )}
              aria-pressed={isSelected}
            >
              {option}
            </button>
          )
        })}
      </div>
    </section>
  )
}
