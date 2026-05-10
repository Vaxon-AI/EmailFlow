import { errorFromException, getAuthUser, success } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const user = await getAuthUser()
    const { threadId } = await params

    const [emailCount, tasks] = await Promise.all([
      prisma.email.count({ where: { userId: user.id, threadId } }),
      prisma.task.findMany({
        where: {
          userId: user.id,
          archivedAt: null,
          emailLinks: { some: { email: { threadId } } },
        },
        select: {
          id: true,
          title: true,
          matterId: true,
          matter: {
            include: { projectContext: { include: { identity: true } } },
          },
        },
      }),
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
