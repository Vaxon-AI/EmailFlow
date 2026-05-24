import { prisma } from '@/lib/prisma'
import type { UserIdentity } from './identity-repo'

export type ProjectContext = {
  id: string
  userId: string
  identityId: string | null
  name: string
  description: string | null
  status: string
  keywords: string[]
  participants: string[]
  confidence: number
  createdAt: Date
  updatedAt: Date
  identity: UserIdentity | null
}

export interface CreateProjectInput {
  name: string
  description?: string | null
  keywords?: string[]
  participants?: string[]
  identityId?: string | null
  confidence?: number
}

const PROJECT_WITH_IDENTITY_INCLUDE = { identity: true } as const
const PROJECT_CONFIRM_SELECT = { keywords: true, participants: true } as const

function buildCreateProjectData(userId: string, input: CreateProjectInput) {
  return {
    userId,
    identityId: input.identityId ?? null,
    name: input.name,
    description: input.description ?? null,
    keywords: normalizeStringArray(input.keywords),
    participants: normalizeStringArray(input.participants),
    confidence: input.confidence ?? 0.72,
  }
}

function buildConfirmProjectData(
  current: { keywords: unknown; participants: unknown } | null,
  input: {
    name?: string
    description?: string | null
    keywords?: string[]
    participants?: string[]
    identityId?: string | null
  }
) {
  return {
    name: input.name,
    description: input.description,
    identityId: input.identityId,
    keywords: mergeStringArrays(current?.keywords, input.keywords),
    participants: mergeStringArrays(current?.participants, input.participants),
    confidence: 1,
  }
}

export async function findAllForUser(userId: string): Promise<ProjectContext[]> {
  const rows = await prisma.projectContext.findMany({
    where: { userId, status: { not: 'archived' } },
    include: PROJECT_WITH_IDENTITY_INCLUDE,
    orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
  })

  return rows.map(mapRow)
}

export async function findById(id: string): Promise<ProjectContext | null> {
  const row = await prisma.projectContext.findUnique({
    where: { id },
    include: PROJECT_WITH_IDENTITY_INCLUDE,
  })
  return row ? mapRow(row) : null
}

export async function findOwnedById(userId: string, projectId: string) {
  return prisma.projectContext.findFirst({
    where: { id: projectId, userId },
    select: { id: true, name: true },
  })
}

export async function createSuggestion(userId: string, input: CreateProjectInput): Promise<ProjectContext> {
  const existing = await prisma.projectContext.findUnique({
    where: { userId_name: { userId, name: input.name } },
    include: PROJECT_WITH_IDENTITY_INCLUDE,
  })

  if (existing) {
    return mapRow(existing)
  }

  const row = await prisma.projectContext.create({
    data: buildCreateProjectData(userId, input),
    include: PROJECT_WITH_IDENTITY_INCLUDE,
  })

  return mapRow(row)
}

export async function attachMatter(projectId: string, matterId: string): Promise<void> {
  await prisma.matterMemory.update({
    where: { id: matterId },
    data: { projectContextId: projectId },
  })
}

export async function assignIdentity(projectId: string, identityId: string): Promise<ProjectContext> {
  const row = await prisma.projectContext.update({
    where: { id: projectId },
    data: { identityId },
    include: PROJECT_WITH_IDENTITY_INCLUDE,
  })

  return mapRow(row)
}

export async function confirmProject(
  id: string,
  input: {
    name?: string
    description?: string | null
    keywords?: string[]
    participants?: string[]
    identityId?: string | null
  }
): Promise<ProjectContext> {
  const current = await prisma.projectContext.findUnique({
    where: { id },
    select: PROJECT_CONFIRM_SELECT,
  })

  const row = await prisma.projectContext.update({
    where: { id },
    data: buildConfirmProjectData(current, input),
    include: PROJECT_WITH_IDENTITY_INCLUDE,
  })

  return mapRow(row)
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

function normalizeStringArray(values?: string[] | null): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
}

function mergeStringArrays(existing: unknown, incoming?: string[] | null): string[] {
  return normalizeStringArray([...asStringArray(existing), ...(incoming ?? [])])
}

function mapIdentity(raw: {
  id: string
  userId: string
  name: string
  description: string | null
  status: string
  keywords: unknown
  hints: unknown
  confidence: number
  createdAt: Date
  updatedAt: Date
} | null): UserIdentity | null {
  if (!raw) return null

  return {
    ...raw,
    keywords: asStringArray(raw.keywords),
    hints: asStringArray(raw.hints),
  }
}

function mapRow(raw: {
  id: string
  userId: string
  identityId: string | null
  name: string
  description: string | null
  status: string
  keywords: unknown
  participants: unknown
  confidence: number
  createdAt: Date
  updatedAt: Date
  identity: {
    id: string
    userId: string
    name: string
    description: string | null
    status: string
    keywords: unknown
    hints: unknown
    confidence: number
    createdAt: Date
    updatedAt: Date
  } | null
}): ProjectContext {
  return {
    ...raw,
    keywords: asStringArray(raw.keywords),
    participants: asStringArray(raw.participants),
    identity: mapIdentity(raw.identity),
  }
}
