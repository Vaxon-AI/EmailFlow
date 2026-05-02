export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { errorFromException, getAuthUser, success, error } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { getExtractRemaining, incrementExtractUsed } from '@/lib/quota'

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser()
    const { title, summary, sourceEmailId, linkedEmailIds } = await req.json()

    if (!title || !sourceEmailId) {
      return error('BAD_REQUEST', 'Title and sourceEmailId are required', 400)
    }

    if (user.plan === 'free') {
      const remaining = await getExtractRemaining(user.id)
      if (remaining <= 0) {
        return error('QUOTA_EXCEEDED', 'Free plan limit of 3 manual task extractions per month reached. Upgrade to Pro for unlimited access.', 402)
      }
    }

    // Create task
    const task = await prisma.task.create({
      data: {
        userId: user.id,
        title,
        summary: summary || '',
        status: 'pending',
        urgency: 3,
        impact: 3,
        priorityScore: 9,
      },
    })

    // Link emails
    const emailIds = linkedEmailIds && linkedEmailIds.length > 0
      ? linkedEmailIds
      : [sourceEmailId]

    await Promise.all(
      emailIds.map((emailId: string) =>
        prisma.taskEmail.create({
          data: {
            taskId: task.id,
            emailId,
            relationship: 'source',
          },
        }).catch(() => {
          // Ignore if email doesn't exist or already linked
        })
      )
    )

    if (user.plan === 'free') {
      await incrementExtractUsed(user.id)
    }

    return success(task)
  } catch (err) {
    console.error('[api/emails/create-task]', err)
    return errorFromException(err, 'INTERNAL_ERROR', 'Failed to create task', 500)
  }
}
