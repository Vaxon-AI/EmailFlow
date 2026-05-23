'use client'

import { cn } from '@/lib/utils'

const DEFAULT_OPTIONS = [1, 2, 3, 4, 5]

/**
 * Pick a single integer score from a horizontal button strip.
 *
 * Used by both the demo and real `/dashboard/tasks` manual-create form to
 * input Urgency / Impact. The two combine into `priorityScore = urgency *
 * impact`; display still uses `getPriorityBand(score)` so list badges
 * (critical / high / medium / low) remain consistent.
 */
export function ScorePicker({
  label,
  value,
  onChange,
  options = DEFAULT_OPTIONS,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  options?: number[]
}) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600">{label}</label>
      <div className="mt-1 flex gap-1">
        {options.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              'h-8 flex-1 rounded-md border text-sm font-medium transition-colors',
              value === n
                ? 'border-brand-300 bg-brand-600 text-white'
                : 'border-gray-200 bg-white text-gray-500 hover:bg-brand-50',
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}
