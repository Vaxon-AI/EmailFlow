export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/api-helpers'
import { findSyncEnabledUserIds } from '@/repositories/user-repo'
import { executeRetention } from '@/services/retention-service'

// ============================================================
// Cron: Retention Cleanup
// Runs daily via Vercel Cron (recommended: once per day, e.g. 03:00 UTC).
// Processes all email-connected users in sequence.
//
// Protected by CRON_SECRET — Vercel sends it as Authorization header.
// To trigger manually: GET /api/cron/retention
//   with header: Authorization: Bearer <CRON_SECRET>
// ============================================================

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const users = await findSyncEnabledUserIds()

  type UserResult = {
    userId: string
    status: 'ok' | 'error'
    emailsArchived?: number
    emailsMetaOnly?: number
    emailsPurged?: number
    emailsDeleted?: number
    attachmentsPurged?: number
    staleReviewsDismissed?: number
    tasksHardDeleted?: number
    tasksSoftArchived?: number
    tasksPurgedFromArchive?: number
    errorCount?: number
    error?: string
  }

  const results: UserResult[] = []

  for (const user of users) {
    try {
      const result = await executeRetention(user.id, 'cron')
      results.push({
        userId: user.id,
        status: 'ok',
        emailsArchived: result.emailsArchived,
        emailsMetaOnly: result.emailsMetaOnly,
        emailsPurged: result.emailsPurged,
        emailsDeleted: result.emailsDeleted,
        attachmentsPurged: result.attachmentsPurged,
        staleReviewsDismissed: result.staleReviewsDismissed,
        tasksHardDeleted: result.tasksHardDeleted,
        tasksSoftArchived: result.tasksSoftArchived,
        tasksPurgedFromArchive: result.tasksPurgedFromArchive,
        errorCount: result.errorCount,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[cron/retention] Failed for user ${user.id}:`, message)
      results.push({ userId: user.id, status: 'error', error: message })
    }
  }

  const succeeded = results.filter((r) => r.status === 'ok').length
  const failed = results.filter((r) => r.status === 'error').length
  console.log(`[cron/retention] Processed ${succeeded}/${users.length} users, ${failed} errors`)

  return NextResponse.json({ success: true, processed: users.length, succeeded, failed, results })
}
