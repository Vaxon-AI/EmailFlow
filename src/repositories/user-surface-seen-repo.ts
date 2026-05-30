import { prisma } from '@/lib/prisma'

/**
 * Tracks whether a user has seen a specific part of the UI (surface) in a
 * specific context (bucket). Used for tours, new-feature banners, and tab
 * "new" indicators.
 */

export async function hasSeen(userId: string, surface: string, bucket: string): Promise<boolean> {
  const seen = await prisma.userSurfaceSeenState.findUnique({
    where: {
      userId_surface_bucket: {
        userId,
        surface,
        bucket,
      },
    },
  })
  return !!seen
}

export async function markSeen(userId: string, surface: string, bucket: string) {
  return prisma.userSurfaceSeenState.upsert({
    where: {
      userId_surface_bucket: {
        userId,
        surface,
        bucket,
      },
    },
    create: {
      userId,
      surface,
      bucket,
      lastSeenAt: new Date(),
    },
    update: { lastSeenAt: new Date() },
  })
}
