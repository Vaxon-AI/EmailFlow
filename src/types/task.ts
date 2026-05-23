// Task-related types
export type { TaskStatus } from '@/lib/task-status'
export { getTaskStatusLabel, isTaskStatus, TASK_STATUS_LABELS, TASK_STATUSES } from '@/lib/task-status'

export type PriorityBand = 'critical' | 'high' | 'medium' | 'low'

export function getPriorityBand(score: number): PriorityBand {
  if (score >= 20) return 'critical'
  if (score >= 12) return 'high'
  if (score >= 6) return 'medium'
  return 'low'
}

// All four chips share the same shape — light tint background + dark text +
// light border — distinguished only by hue. The eye reads a warm-to-cool
// luminance ladder: critical red → orange → amber → neutral gray. No solid
// fills, no white text, no rainbow.
export function getPriorityColor(band: PriorityBand): string {
  switch (band) {
    case 'critical': return 'text-critical-700 bg-critical-50 border-critical-100'
    case 'high':     return 'text-orange-700 bg-orange-50 border-orange-100'
    case 'medium':   return 'text-warning-700 bg-warning-50 border-warning-100'
    case 'low':      return 'text-gray-500 bg-transparent border-gray-200'
  }
}

export function getPriorityLabel(band: PriorityBand): string {
  switch (band) {
    case 'critical': return 'Critical'
    case 'high': return 'High'
    case 'medium': return 'Medium'
    case 'low': return 'Low'
  }
}
