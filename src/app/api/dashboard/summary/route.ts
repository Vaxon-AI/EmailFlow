export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { errorFromException, getAuthUser, success } from '@/lib/api-helpers'
import { getDashboardSummary } from '@/repositories/dashboard-summary-repo'

const EMPTY_SUMMARY = {
  view: 'week',
  stats: {
    emails: { total: 0, action: 0, awareness: 0, ignore: 0, uncertain: 0, linkedAction: 0, needsReview: 0, tracked: 0, unclassified: 0 },
    tasks: { total: 0, pending: 0, active: 0, completed: 0 },
    sync: {
      lastSyncAt: null,
      emailConnected: false,
      syncEnabled: false,
      providerReauthRequired: false,
      providerReauthReason: null,
      providerReauthAt: null,
      providerReauthProvider: null,
    },
  },
  tasks: {
    activePreview: [],
    pendingPreview: [],
    activeCount: 0,
    pendingCount: 0,
    priorityCounts: { critical: 0, high: 0, medium: 0, low: 0 },
    upcomingCount: 0,
    aiAcceptance: { accepted: 0, rejected: 0, rate: null },
  },
  attentionEmails: [],
  attentionEmailCount: 0,
  momentum: [],
  feedback: {
    label: 'Workspace Summary',
    tone: 'neutral',
    message: '0 tasks completed overall, 0 currently open.',
  },
  currentPeriod: null,
  allTime: null,
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ success: true, data: EMPTY_SUMMARY })

    const summary = await getDashboardSummary(user.id, {
      identityIds: parseMultiParam(req.nextUrl.searchParams, 'identity'),
      projectIds: parseMultiParam(req.nextUrl.searchParams, 'project'),
      view: parseView(req.nextUrl.searchParams.get('view')),
      momentumEnd: parseDateParam(req.nextUrl.searchParams.get('momentumEnd')),
      timezoneOffset: parseTimezoneOffset(req.nextUrl.searchParams.get('timezoneOffset')),
    })
    return success(summary)
  } catch (err) {
    console.error('[api/dashboard/summary GET]', err)
    return errorFromException(err, 'INTERNAL_ERROR', 'Failed to load dashboard summary', 500)
  }
}

function parseView(value: string | null) {
  return value === 'today' || value === 'all' ? value : 'week'
}

function parseDateParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? undefined : value
}

function parseTimezoneOffset(value: string | null) {
  const offset = Number(value)
  return Number.isFinite(offset) ? offset : 0
}

function parseMultiParam(params: URLSearchParams, key: string) {
  return params
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean)
}
