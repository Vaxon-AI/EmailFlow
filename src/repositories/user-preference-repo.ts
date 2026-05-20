import { prisma } from '@/lib/prisma'

export type UserPreference = {
  id: string
  userId: string
  roles: string[]
  purposes: string[]
  focusAreas: string[]
  createdAt: Date
  updatedAt: Date
}

export interface UpsertUserPreferenceInput {
  roles: string[]
  purposes: string[]
  focusAreas: string[]
}

export async function findByUserId(userId: string): Promise<UserPreference | null> {
  const row = await prisma.userPreference.findUnique({ where: { userId } })
  return row ? mapRow(row) : null
}

export async function upsert(userId: string, input: UpsertUserPreferenceInput): Promise<UserPreference> {
  const row = await prisma.userPreference.upsert({
    where: { userId },
    create: {
      userId,
      roles: input.roles,
      purposes: input.purposes,
      focusAreas: input.focusAreas,
    },
    update: {
      roles: input.roles,
      purposes: input.purposes,
      focusAreas: input.focusAreas,
    },
  })
  return mapRow(row)
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

function mapRow(raw: {
  id: string
  userId: string
  roles: unknown
  purposes: unknown
  focusAreas: unknown
  createdAt: Date
  updatedAt: Date
}): UserPreference {
  return {
    id: raw.id,
    userId: raw.userId,
    roles: asStringArray(raw.roles),
    purposes: asStringArray(raw.purposes),
    focusAreas: asStringArray(raw.focusAreas),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}
