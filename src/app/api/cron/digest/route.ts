export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/api-helpers'
import { getLocalHourSafe, getLocalWeekday } from '@/lib/timezone'
import { findSyncEnabledUsersWithTimezone } from '@/repositories/user-repo'
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

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  // Find all users with email connected
  const users = await findSyncEnabledUsersWithTimezone()

  const results: {
    userId: string
    status: string
    daily?: 'ok' | 'skipped' | 'error'
    weekly?: 'ok' | 'skipped' | 'error'
    reason?: string
    error?: string
  }[] = []

  const now = new Date()

  for (const user of users) {
    const tz = user.timezone || 'UTC'
    const hour = getLocalHourSafe(now, tz)
    const weekday = getLocalWeekday(now, tz)

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
