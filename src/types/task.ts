// Task-related types
export type TaskStatus = 'pending' | 'confirmed' | 'completed' | 'dismissed'

export type PriorityBand = 'critical' | 'high' | 'medium' | 'low'

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'AI Suggestions',
  confirmed: 'Active',
  completed: 'Completed',
  dismissed: 'Dismissed',
}

export function getTaskStatusLabel(status?: string | null): string {
  return TASK_STATUS_LABELS[status as TaskStatus] ?? 'AI Suggestions'
}

export function getPriorityBand(score: number): PriorityBand {
  if (score >= 20) return 'critical'
  if (score >= 12) return 'high'
  if (score >= 6) return 'medium'
  return 'low'
}

// Priority hierarchy under Mono Indigo:
//   Critical = solid critical-red    (truly destructive / blocking — only saturated red on the page)
//   High     = solid warning amber   (alerting but not panic; warm hue distinguishes from brand)
//   Medium   = brand tint            (visible, on-brand, low alarm)
//   Low      = plain neutral         (gray text only, almost no chip)
// Three coloured chips + one neutral gives the eye a clear ordering by
// luminance and warmth, without rainbow chaos.
export function getPriorityColor(band: PriorityBand): string {
  switch (band) {
    case 'critical': return 'text-white bg-critical border-critical'
    case 'high': return 'text-warning-700 bg-warning-50 border-warning-100'
    case 'medium': return 'text-brand-700 bg-brand-50 border-brand-100'
    case 'low': return 'text-gray-400 bg-transparent border-gray-200'
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
