import { prisma } from '@/lib/prisma'

type EnsuredMatter = {
  id: string
  projectName: string
}

const MANUAL_PROJECT_SUMMARY = 'Manually assigned to this project'

export async function ensureMatterForProject(userId: string, projectId: string): Promise<EnsuredMatter | null> {
  const project = await prisma.projectContext.findFirst({
    where: { id: projectId, userId },
    select: { id: true, name: true },
  })

  if (!project) return null

  const existingMatter = await prisma.matterMemory.findFirst({
    where: { userId, projectContextId: projectId },
    select: { id: true },
  })

  if (existingMatter) {
    return {
      ...existingMatter,
      projectName: project.name,
    }
  }

  const createdMatter = await prisma.matterMemory.create({
    data: {
      userId,
      projectContextId: projectId,
      title: project.name,
      summary: MANUAL_PROJECT_SUMMARY,
      status: 'open',
      topic: 'other',
    },
    select: { id: true },
  })

  return {
    ...createdMatter,
    projectName: project.name,
  }
}
