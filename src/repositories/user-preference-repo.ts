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

function buildPreferenceData(input: UpsertUserPreferenceInput) {
  return {
    roles: input.roles,
    purposes: input.purposes,
    focusAreas: input.focusAreas,
  }
}

export async function findByUserId(userId: string): Promise<UserPreference | null> {
  const row = await prisma.userPreference.findUnique({ where: { userId } })
  return row ? mapRow(row) : null
}

export async function upsert(userId: string, input: UpsertUserPreferenceInput): Promise<UserPreference> {
  const preferenceData = buildPreferenceData(input)
  const row = await prisma.userPreference.upsert({
    where: { userId },
    create: {
      userId,
      ...preferenceData,
    },
    update: preferenceData,
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
    ...pickBasePreferenceFields(raw),
    roles: asStringArray(raw.roles),
    purposes: asStringArray(raw.purposes),
    focusAreas: asStringArray(raw.focusAreas),
  }
}

function pickBasePreferenceFields(raw: {
  id: string
  userId: string
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: raw.id,
    userId: raw.userId,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}
