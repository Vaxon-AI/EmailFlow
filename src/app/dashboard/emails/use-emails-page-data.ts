'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import type { DateRange } from 'react-day-picker'
import { CACHE_TIME } from '@/lib/query-cache'
import {
  filterEmails,
  isFyiEmail,
  isIgnoredEmail,
  isNeedsActionPageEmail,
  isTrackedEmail,
  type BatchStatus,
  type EmailItem,
  type EmailTabState,
  type QueryResponse,
  type Tab,
} from './email-page-types'

export function useEmailsPageData(input: {
  tab: Tab
  page: number
  manualReviewMode: boolean
  syncBatchId: string | null
  batchDismissed: boolean
  accountFilter: string
  searchQuery: string
  dateRange?: DateRange
}) {
  const {
    tab,
    page,
    manualReviewMode,
    syncBatchId,
    batchDismissed,
    accountFilter,
    searchQuery,
    dateRange,
  } = input

  const queryClient = useQueryClient()

  const { data: pendingReviewData } = useQuery({
    queryKey: ['pending-review-count'],
    queryFn: async () => {
      const res = await fetch('/api/emails/pending-review')
      const json = await res.json()
      return json.data?.count as number
    },
    enabled: manualReviewMode,
    staleTime: CACHE_TIME.list,
  })
  const pendingReviewCount = pendingReviewData ?? 0

  const { data: batchStatus } = useQuery<BatchStatus>({
    queryKey: ['syncBatch', syncBatchId],
    queryFn: async () => {
      const res = await fetch(`/api/sync/batch/${syncBatchId}`)
      const json = await res.json()
      return json.data as BatchStatus
    },
    enabled: !!syncBatchId && !batchDismissed,
    refetchInterval: (query) => {
      const data = query.state.data as BatchStatus | undefined
      if (!data || data.isComplete) return false
      return 3000
    },
    staleTime: 0,
  })

  useEffect(() => {
    if (batchStatus?.isComplete && batchStatus.actionEmailCount === 0) {
      sessionStorage.removeItem('emailflow:syncBatchId')
    }
  }, [batchStatus])

  useEffect(() => {
    if (!batchStatus) return
    queryClient.invalidateQueries({ queryKey: ['emails'] })
    queryClient.invalidateQueries({ queryKey: ['emails', 'tab-states'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
  }, [
    batchStatus,
    batchStatus?.pendingEmails,
    batchStatus?.classifiedEmails,
    batchStatus?.quotaSkippedEmails,
    batchStatus?.uncertainCount,
    batchStatus?.uncertainEmails,
    batchStatus?.isComplete,
    queryClient,
  ])

  const { data: res, isLoading, isFetching, isPlaceholderData } = useQuery({
    queryKey: ['emails', page, tab],
    queryFn: () =>
      fetch(`/api/emails?page=${page}&limit=2000&bucket=${tab}`).then((response) => response.json()),
    staleTime: CACHE_TIME.list,
    placeholderData: (previous) => previous,
  })
  // While switching to a not-yet-cached tab, placeholderData keeps showing the
  // previous tab's emails with isLoading=false. The list ends up empty after
  // client-side filtering and looks like the click did nothing. Treat that
  // window as loading so the user sees a spinner instead.
  const isListLoading = isLoading || (isPlaceholderData && isFetching)

  const { data: tabStatesRes } = useQuery<{ data: EmailTabState[] }>({
    queryKey: ['emails', 'tab-states'],
    queryFn: () => fetch('/api/emails/tab-states').then((response) => response.json()),
    staleTime: 0,
  })

  const markTabSeenMutation = useMutation({
    mutationFn: async (bucket: Tab) => {
      const res = await fetch('/api/emails/tab-states/seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json?.error?.message || 'Failed to mark tab seen')
      return bucket
    },
    onSuccess: (bucket) => {
      queryClient.setQueryData<{ data: EmailTabState[] }>(['emails', 'tab-states'], (current) => {
        if (!current?.data) return current
        return {
          ...current,
          data: current.data.map((state) =>
            state.bucket === bucket ? { ...state, newCount: 0, lastSeenAt: new Date().toISOString() } : state
          ),
        }
      })
    },
  })

  const { data: unclassifiedRes } = useQuery<{ data: { count: number } }>({
    queryKey: ['emails', 'unclassified-count'],
    queryFn: () => fetch('/api/emails/unclassified-count').then((response) => response.json()),
    staleTime: 0,
  })

  const emails = useMemo(() => (res?.data || []) as EmailItem[], [res?.data])
  const meta = (res as QueryResponse<EmailItem[]>)?.meta

  const tabStateMap = useMemo(() => {
    const map = new Map<Tab, EmailTabState>()
    for (const state of tabStatesRes?.data ?? []) map.set(state.bucket, state)
    return map
  }, [tabStatesRes?.data])
  const activeTabNewCount = tabStateMap.get(tab)?.newCount ?? 0

  useEffect(() => {
    if (!tabStatesRes?.data || activeTabNewCount <= 0) return
    markTabSeenMutation.mutate(tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, activeTabNewCount, tabStatesRes?.data])

  const accounts = useMemo(() => {
    const set = new Set<string>()
    for (const email of emails) {
      if (email.accountEmail) set.add(email.accountEmail)
    }
    return Array.from(set)
  }, [emails])

  const filtered = useMemo(() => filterEmails({
    emails,
    tab,
    accountFilter,
    searchQuery,
    dateRange,
  }), [emails, tab, accountFilter, searchQuery, dateRange])

  const needsActionCount = tabStateMap.get('needs_action')?.totalCount ?? emails.filter(isNeedsActionPageEmail).length
  const trackedCount = tabStateMap.get('tracked')?.totalCount ?? emails.filter(isTrackedEmail).length
  const infoCount = tabStateMap.get('fyi')?.totalCount ?? emails.filter(isFyiEmail).length
  const ignoredCount = tabStateMap.get('ignored')?.totalCount ?? emails.filter(isIgnoredEmail).length
  const unclassifiedCount = tabStateMap.get('unclassified')?.totalCount ?? unclassifiedRes?.data?.count ?? 0
  const pendingCount = emails.filter((email) => email.processingStatus === 'pending').length

  const tabs: { key: Tab; label: string; count: number }[] = [
    ...(unclassifiedCount > 0 ? [{ key: 'unclassified' as const, label: 'Unclassified', count: unclassifiedCount }] : []),
    { key: 'needs_action', label: 'Needs Action', count: needsActionCount },
    { key: 'tracked', label: 'Tracked', count: trackedCount },
    { key: 'fyi', label: 'FYI', count: infoCount },
    { key: 'ignored', label: 'Ignored', count: ignoredCount },
  ]

  const batchBannerActive =
    !!syncBatchId &&
    !batchDismissed &&
    !(batchStatus?.isComplete && batchStatus.actionEmailCount === 0)

  return {
    pendingReviewCount,
    batchStatus,
    batchBannerActive,
    res,
    isLoading,
    isListLoading,
    emails,
    meta,
    tabStateMap,
    accounts,
    filtered,
    unclassifiedCount,
    pendingCount,
    tabs,
  }
}
