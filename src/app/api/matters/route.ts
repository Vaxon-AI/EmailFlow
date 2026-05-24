export const dynamic = 'force-dynamic'
import { getAuthUser, success } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'

// GET /api/matters
// Returns all MatterMemory for the user, with linked thread IDs and task IDs.
// Used by the UI to group emails and tasks by project/matter.
export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return success([])

    const matters = await prisma.matterMemory.findMany({
      where: { userId: user.id },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        projectContext: {
          include: {
            identity: true,
          },
        },
        threads: {
          select: {
            threadId: true,
            linkedTaskId: true,
          },
        },
      },
    })

    // Shape: { id, title, topic, status, summary, nextAction, threadCount, emailCount, threadIds, taskIds }
    const shaped = matters.map((m) => ({
      id: m.id,
      title: m.title,
      topic: m.topic,
      status: m.status,
      summary: m.summary,
      nextAction: m.nextAction,
      threadCount: m.threadCount,
      emailCount: m.emailCount,
      lastMessageAt: m.lastMessageAt,
      project: m.projectContext
        ? {
            id: m.projectContext.id,
            name: m.projectContext.name,
            confidence: m.projectContext.confidence,
            identity: m.projectContext.identity
              ? {
                  id: m.projectContext.identity.id,
                  name: m.projectContext.identity.name,
                  confidence: m.projectContext.identity.confidence,
                }
              : null,
          }
        : null,
      // All provider threadIds belonging to this matter (for email grouping)
      threadIds: m.threads.map((t) => t.threadId),
      // All task IDs linked to threads in this matter (for task grouping)
      taskIds: m.threads.map((t) => t.linkedTaskId).filter(Boolean) as string[],
    }))

    return success(shaped)
  } catch (err) {
    console.error('[api/matters GET]', err)
    return success([])
  }
}
