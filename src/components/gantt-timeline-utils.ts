export const DAY_MS = 86400000
export const COL_WIDTH = 48
export const ROW_HEIGHT = 60
export const LABEL_WIDTH = 240
export const HANDLE_WIDTH = 10
export const TIMELINE_ORDER_STORAGE_KEY = 'emailflow-ai:timeline-order'

export type TimelineTask = {
  id: string
  title: string
  status: 'ai_suggestion' | 'active' | 'completed'
  priorityScore?: number | null
  startDate?: string | null
  explicitDeadline?: string | null
  inferredDeadline?: string | null
  userSetDeadline?: string | null
  project?: {
    id: string
    name: string
    identity: { id: string; name: string } | null
  } | null
  matter?: { id: string; title: string } | null
}

export type UpdateTaskMutation = {
  mutate: (
    vars: { id: string; data: { startDate?: string; userSetDeadline?: string } },
    options?: { onSuccess?: () => void; onError?: () => void }
  ) => void
}

export type DragState = {
  taskId: string
  mode: 'move' | 'resize-left' | 'resize-right'
  origStart: Date
  origEnd: Date
  startX: number
}

export type DragSnapshot = Omit<DragState, 'startX'> & { delta: number }

export type PendingPosition = {
  taskId: string
  start: Date
  end: Date
}

export type BarStyle = {
  left: number
  width: number
  taskStart: Date
  taskEnd: Date
}

export const BAND_COLORS: Record<string, { bar: string; border: string; text: string; dot: string }> = {
  critical: { bar: 'bg-critical', border: 'border-critical-700/20', text: 'text-white', dot: 'bg-critical' },
  high:     { bar: 'bg-orange',   border: 'border-orange-700/20',   text: 'text-white', dot: 'bg-orange' },
  medium:   { bar: 'bg-yellow',   border: 'border-yellow-700/20',   text: 'text-white', dot: 'bg-yellow' },
  low:      { bar: 'bg-slate-500', border: 'border-slate-600/20',    text: 'text-white', dot: 'bg-slate-500' },
}

export function toDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatShort(d: Date) {
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

export function startOfDay(d: Date) {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

export function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function startOfWeek(d: Date) {
  const r = startOfDay(d)
  r.setDate(r.getDate() - r.getDay())
  return r
}

export function diffDays(a: Date, b: Date) {
  const aNoon = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 12)
  const bNoon = new Date(b.getFullYear(), b.getMonth(), b.getDate(), 12)
  return Math.round((aNoon.getTime() - bNoon.getTime()) / DAY_MS)
}

export function intersectsRange(
  start: Date | null,
  end: Date | null,
  rangeStart: Date,
  rangeEnd: Date
) {
  if (!start || !end) return false
  return start <= rangeEnd && end >= rangeStart
}

export function getTaskStart(task: TimelineTask): Date | null {
  if (task.startDate) return startOfDay(new Date(task.startDate))
  const end = getTaskEnd(task)
  if (end) return addDays(end, -2)
  return null
}

export function getTaskEnd(task: TimelineTask): Date | null {
  const raw = task.userSetDeadline || task.explicitDeadline || task.inferredDeadline
  return raw ? startOfDay(new Date(raw)) : null
}
