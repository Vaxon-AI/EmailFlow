export const TASK_STATUSES = ['ai_suggestion', 'active', 'completed'] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  ai_suggestion: 'AI suggestion',
  active: 'Active',
  completed: 'Completed',
}

const ACTIVE_TASK_STATUSES: TaskStatus[] = ['ai_suggestion', 'active']

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && TASK_STATUSES.includes(value as TaskStatus)
}

export function getTaskStatusLabel(status?: string | null): string {
  return isTaskStatus(status) ? TASK_STATUS_LABELS[status] : 'AI suggestion'
}

export function activeTaskStatuses(): TaskStatus[] {
  return [...ACTIVE_TASK_STATUSES]
}
