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
    .filter((task) => task.status !== 'dismissed')

  if (tasks.length === 0) return null
  if (tasks.some((task) => task.status === 'pending')) return 'ai_suggestion'
  if (tasks.some((task) => task.status === 'confirmed')) return 'active'
  if (tasks.every((task) => task.status === 'completed')) return 'completed'
  return 'active'
}

