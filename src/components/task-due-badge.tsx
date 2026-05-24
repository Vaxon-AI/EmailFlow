import { Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

const DAY_MS = 86_400_000

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function formatMonthDay(date: Date): string {
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

type Props = {
  deadline?: string | null
  /** Optional start date — when present and different from deadline, the
   *  badge renders as a range (e.g. "Mar 10 – Mar 15") instead of "Due Mar 15". */
  startDate?: string | null
  /** Apply the muted (greyed-out) tone instead of urgency colours — for
   *  completed / dismissed task rows. */
  muted?: boolean
  /** Wrapper layout classes (e.g. `ml-auto shrink-0`) passed by caller. */
  className?: string
}

/**
 * Bordered date pill used at the right edge of the task-row meta footer.
 * Shared between `/dashboard/tasks` and `/demo/tasks` so they don't drift.
 *
 * Tone hierarchy (most urgent → least):
 *   overdue  → red       (deadline < today, non-muted)
 *   due today → red      (same colour as overdue — both demand attention today)
 *   due soon → amber     (≤ 3 days out)
 *   default  → grey      (> 3 days out, non-muted)
 *   muted    → soft grey (caller passed muted=true)
 */
export function TaskDueBadge({ deadline, startDate, muted, className }: Props) {
  if (!deadline) return null
  const end = new Date(deadline)
  if (Number.isNaN(end.getTime())) return null

  // Range label (start–end) when both dates differ; single "Due X" otherwise.
  let label = `Due ${formatMonthDay(end)}`
  if (startDate) {
    const start = new Date(startDate)
    if (!Number.isNaN(start.getTime()) && start.toDateString() !== end.toDateString()) {
      label = `${formatMonthDay(start)} – ${formatMonthDay(end)}`
    }
  }

  const today = startOfDay(new Date())
  const diffDays = Math.round((startOfDay(end).getTime() - today.getTime()) / DAY_MS)
  const overdue = !muted && diffDays < 0
  const dueToday = !muted && diffDays === 0
  const dueSoon = !muted && diffDays > 0 && diffDays <= 3

  if (overdue) {
    label =
      diffDays === -1
        ? 'Overdue: 1 day'
        : `Overdue: ${-diffDays} days`
  } else if (dueToday) {
    label = 'Due today'
  }

  // No background fill — outline + coloured text/icon only.
  const tone = muted
    ? 'border-gray-200 text-gray-400'
    : overdue || dueToday
      ? 'border-critical/40 text-critical'
      : dueSoon
        ? 'border-warning-300 text-warning-700'
        : 'border-gray-300 text-gray-600'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold',
        tone,
        className,
      )}
    >
      <Calendar className="h-3.5 w-3.5" />
      {label}
    </span>
  )
}
