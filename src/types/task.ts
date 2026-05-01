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

export function getPriorityColor(band: PriorityBand): string {
  switch (band) {
    case 'critical': return 'text-red-600 bg-red-50 border-red-200'
    case 'high': return 'text-orange-600 bg-orange-50 border-orange-200'
    case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    case 'low': return 'text-gray-500 bg-gray-50 border-gray-200'
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
