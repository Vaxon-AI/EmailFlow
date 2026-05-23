export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { errorFromException, getAuthUser, success, error } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import * as emailRepo from '@/repositories/email-repo'
import { getExtractRemaining, incrementExtractUsed, FREE_EXTRACT_LIMIT } from '@/lib/quota'

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser()
    const { title, summary, sourceEmailId, linkedEmailIds, urgency, impact, priorityScore, userSetDeadline, startDate, actionItems, projectId } = await req.json()

    if (!title || !sourceEmailId) {
      return error('BAD_REQUEST', 'Title and sourceEmailId are required', 400)
    }

    if (user.plan === 'free') {
      const remaining = await getExtractRemaining(user.id)
      if (remaining <= 0) {
        return error('QUOTA_EXCEEDED', `Free plan limit of ${FREE_EXTRACT_LIMIT} manual task extractions per month reached. Upgrade to Pro for unlimited access.`, 402)
      }
    }

    // If projectId provided, find or create a MatterMemory to link the task
    let matterId: string | undefined
    if (projectId) {
      const project = await prisma.projectContext.findFirst({ where: { id: projectId, userId: user.id } })
      if (project) {
        let matter = await prisma.matterMemory.findFirst({ where: { userId: user.id, projectContextId: projectId } })
        if (!matter) {
          matter = await prisma.matterMemory.create({
            data: {
              userId: user.id,
              projectContextId: projectId,
              title: project.name,
              summary: 'Manually assigned to this project',
              status: 'open',
              topic: 'other',
            },
          })
        }
        matterId = matter.id
      }
    }

    // Create task
    const task = await prisma.task.create({
      data: {
        userId: user.id,
        title,
        summary: summary || '',
        status: 'active',
        activeAt: new Date(),
        urgency: urgency ?? 3,
        impact: impact ?? 3,
        priorityScore: priorityScore ?? 9,
        userSetDeadline: userSetDeadline || undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        actionItems: actionItems ? JSON.stringify(actionItems) : undefined,
        source: 'manual',
        matterId,
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

    // Manually creating a task is an explicit "I'm handling this" signal —
    // move every linked email into the Tracked bucket so it stops showing up
    // in Needs Action. Per-email catch so one bad row doesn't fail the request.
    await Promise.all(
      emailIds.map((emailId: string) =>
        emailRepo.setEmailBucket(emailId, 'tracked').catch((err: unknown) => {
          console.error('[create-task] failed to move email to tracked', emailId, err)
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
