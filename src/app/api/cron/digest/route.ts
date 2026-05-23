export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createDailyDigest, createWeeklyDigest } from '@/workflows/digest-pipeline'

// ============================================================
// Cron: Daily Digest Generator
// Runs every hour via Vercel Cron.
// For each email-connected user, fires when it's 20:xx in their timezone.
//
// Protected by CRON_SECRET — Vercel sends it as Authorization header.
// To trigger manually: GET /api/cron/digest
//   with header: Authorization: Bearer <CRON_SECRET>
// ============================================================

function localHour(timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date())
    const hourPart = parts.find(p => p.type === 'hour')
    return hourPart ? parseInt(hourPart.value, 10) : -1
  } catch {
    return -1
  }
}

function localWeekday(timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    }).formatToParts(new Date())
    const weekdayPart = parts.find((p) => p.type === 'weekday')?.value
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    }
    return weekdayPart ? map[weekdayPart] ?? -1 : -1
  } catch {
    return -1
  }
}

export async function GET(req: NextRequest) {
  // Verify secret
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Find all users with email connected
  const users = await prisma.user.findMany({
    where: { accounts: { some: { provider: 'google', syncEnabled: true } } },
    select: { id: true, email: true, timezone: true },
  })

  const results: {
    userId: string
    status: string
    daily?: 'ok' | 'skipped' | 'error'
    weekly?: 'ok' | 'skipped' | 'error'
    reason?: string
    error?: string
  }[] = []

  for (const user of users) {
    const tz = user.timezone || 'UTC'
    const hour = localHour(tz)
    const weekday = localWeekday(tz)

    // Only generate digests when it's 20:xx in the user's timezone.
    if (hour !== 20) {
      results.push({
        userId: user.id,
        status: 'skipped',
        daily: 'skipped',
        weekly: 'skipped',
        reason: `local hour is ${hour} in ${tz}`,
      })
      continue
    }

    try {
      await createDailyDigest(user.id, tz)
      const weeklyStatus = weekday === 0 ? 'ok' : 'skipped'

      if (weekday === 0) {
        await createWeeklyDigest(user.id, tz)
      }

      results.push({
        userId: user.id,
        status: 'ok',
        daily: 'ok',
        weekly: weeklyStatus,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown digest failure'
      console.error(`[cron/digest] Failed for user ${user.id}:`, message)
      results.push({
        userId: user.id,
        status: 'error',
        daily: 'error',
        weekly: weekday === 0 ? 'error' : 'skipped',
        error: message,
      })
    }
  }

  const generated = results.filter(r => r.daily === 'ok').length
  const weeklyGenerated = results.filter(r => r.weekly === 'ok').length
  const skipped = results.filter(r => r.status === 'skipped').length
  console.log(
    `[cron/digest] Generated daily ${generated}, weekly ${weeklyGenerated}, skipped ${skipped}/${users.length} users`
  )
  return NextResponse.json({ success: true, results })
}
