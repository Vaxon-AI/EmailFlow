import { prisma } from '@/lib/prisma'

type EnsuredMatter = {
  id: string
  projectName: string
}

const MANUAL_PROJECT_SUMMARY = 'Manually assigned to this project'

async function findOwnedProject(userId: string, projectId: string) {
  return prisma.projectContext.findFirst({
    where: { id: projectId, userId },
    select: { id: true, name: true },
  })
}

async function findExistingMatter(userId: string, projectId: string) {
  return prisma.matterMemory.findFirst({
    where: { userId, projectContextId: projectId },
    select: { id: true },
  })
}

async function createMatterForProject(userId: string, projectId: string, projectName: string) {
  return prisma.matterMemory.create({
    data: {
      userId,
      projectContextId: projectId,
      title: projectName,
      summary: MANUAL_PROJECT_SUMMARY,
      status: 'open',
      topic: 'other',
    },
    select: { id: true },
  })
}

function toEnsuredMatter(matter: { id: string }, projectName: string): EnsuredMatter {
  return {
    ...matter,
    projectName,
  }
}

export async function ensureMatterForProject(userId: string, projectId: string): Promise<EnsuredMatter | null> {
  const project = await findOwnedProject(userId, projectId)

  if (!project) return null

  const existingMatter = await findExistingMatter(userId, projectId)

  if (existingMatter) {
    return toEnsuredMatter(existingMatter, project.name)
  }

  const createdMatter = await createMatterForProject(userId, projectId, project.name)

  return toEnsuredMatter(createdMatter, project.name)
}
