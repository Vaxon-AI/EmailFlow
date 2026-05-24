import { prisma } from '@/lib/prisma'

export type UserIdentity = {
  id: string
  userId: string
  name: string
  description: string | null
  status: string
  keywords: string[]
  hints: string[]
  confidence: number
  createdAt: Date
  updatedAt: Date
}

export interface CreateIdentityInput {
  name: string
  description?: string | null
  keywords?: string[]
  hints?: string[]
  confidence?: number
}

const IDENTITY_CONFIRM_SELECT = { keywords: true, hints: true } as const

function buildCreateIdentityData(userId: string, input: CreateIdentityInput) {
  return {
    userId,
    name: input.name,
    description: input.description ?? null,
    keywords: normalizeStringArray(input.keywords),
    hints: normalizeStringArray(input.hints),
    confidence: input.confidence ?? 0.72,
  }
}

function buildConfirmIdentityData(
  current: { keywords: unknown; hints: unknown } | null,
  input: { name?: string; description?: string | null; keywords?: string[]; hints?: string[] }
) {
  return {
    name: input.name,
    description: input.description,
    keywords: mergeStringArrays(current?.keywords, input.keywords),
    hints: mergeStringArrays(current?.hints, input.hints),
    confidence: 1,
  }
}

export async function findAllForUser(userId: string): Promise<UserIdentity[]> {
  const rows = await prisma.userIdentity.findMany({
    where: { userId, status: { not: 'archived' } },
    orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
  })

  return rows.map(mapRow)
}

export async function findById(id: string): Promise<UserIdentity | null> {
  const row = await prisma.userIdentity.findUnique({ where: { id } })
  return row ? mapRow(row) : null
}

export async function createSuggestion(userId: string, input: CreateIdentityInput): Promise<UserIdentity> {
  const existing = await prisma.userIdentity.findUnique({
    where: { userId_name: { userId, name: input.name } },
  })

  if (existing) {
    return mapRow(existing)
  }

  const row = await prisma.userIdentity.create({
    data: buildCreateIdentityData(userId, input),
  })

  return mapRow(row)
}

export async function confirmIdentity(
  id: string,
  input: { name?: string; description?: string | null; keywords?: string[]; hints?: string[] }
): Promise<UserIdentity> {
  const current = await prisma.userIdentity.findUnique({
    where: { id },
    select: IDENTITY_CONFIRM_SELECT,
  })

  const row = await prisma.userIdentity.update({
    where: { id },
    data: buildConfirmIdentityData(current, input),
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

function mapRow(raw: {
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
}): UserIdentity {
  return {
    ...raw,
    keywords: asStringArray(raw.keywords),
    hints: asStringArray(raw.hints),
  }
}
