import { prisma } from '@/lib/prisma'

export async function logError(action: string, err: unknown, userId?: string | null) {
  const error = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? (err.stack ?? null) : null

  try {
    await prisma.errorLog.create({
      data: {
        action,
        error,
        stack,
        userId: userId ?? null,
      },
    })
  } catch {
    // Error logging must never block the request path.
  }
}
