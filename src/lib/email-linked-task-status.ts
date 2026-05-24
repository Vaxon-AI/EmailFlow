export type LinkedEmailTask = {
  status?: string | null
}

export type EmailLinkedTaskState = 'ai_suggestion' | 'active' | 'completed'

type TaskLinkLike = {
  task?: LinkedEmailTask | null
}

const LINKED_TASK_STATE_PRIORITY: Record<EmailLinkedTaskState, number> = {
  ai_suggestion: 3,
  active: 2,
  completed: 1,
}

function toEmailLinkedTaskState(status?: string | null): EmailLinkedTaskState | null {
  if (status === 'ai_suggestion' || status === 'active' || status === 'completed') {
    return status
  }
  return null
}

export function getEmailLinkedTaskState(links?: TaskLinkLike[] | null): EmailLinkedTaskState | null {
  let highestPriorityState: EmailLinkedTaskState | null = null
  let hasEffectiveTask = false

  for (const link of links ?? []) {
    if (!link.task) continue

    hasEffectiveTask = true
    const state = toEmailLinkedTaskState(link.task.status)
    if (!state) {
      highestPriorityState = 'active'
      continue
    }

    if (
      !highestPriorityState ||
      LINKED_TASK_STATE_PRIORITY[state] > LINKED_TASK_STATE_PRIORITY[highestPriorityState]
    ) {
      highestPriorityState = state
    }
  }

  return hasEffectiveTask ? highestPriorityState ?? 'active' : null
}
