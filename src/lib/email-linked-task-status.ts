export type LinkedEmailTask = {
  status?: string | null
}

export type EmailLinkedTaskState = 'ai_suggestion' | 'active' | 'completed'

type TaskLinkLike = {
  task?: LinkedEmailTask | null
}

export function getEmailLinkedTaskState(links?: TaskLinkLike[] | null): EmailLinkedTaskState | null {
  const tasks = (links ?? [])
    .map((link) => link.task)
    .filter((task): task is LinkedEmailTask => Boolean(task))

  if (tasks.length === 0) return null
  if (tasks.some((task) => task.status === 'ai_suggestion')) return 'ai_suggestion'
  if (tasks.some((task) => task.status === 'active')) return 'active'
  if (tasks.every((task) => task.status === 'completed')) return 'completed'
  return 'active'
}
