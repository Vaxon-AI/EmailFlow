import { errorFromException, getAuthUser, success } from '@/lib/api-helpers'
import { countEmailsByThread } from '@/repositories/email-repo'
import { findActiveTasksLinkedToThread } from '@/repositories/task-repo'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const user = await getAuthUser()
    const { threadId } = await params

    const [emailCount, tasks] = await Promise.all([
      countEmailsByThread(user.id, threadId),
      findActiveTasksLinkedToThread(user.id, threadId),
    ])

    const enrichedTasks = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      project: t.matter?.projectContext
        ? {
            id: t.matter.projectContext.id,
            name: t.matter.projectContext.name,
            identity: t.matter.projectContext.identity
              ? { id: t.matter.projectContext.identity.id, name: t.matter.projectContext.identity.name }
              : null,
          }
        : null,
    }))

    return success({ threadId, emailCount, tasks: enrichedTasks })
  } catch (err) {
    console.error('[api/threads/related]', err)
    return errorFromException(err, 'INTERNAL', 'Failed to load related items', 500)
  }
}
