import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'
import { CACHE_TIME } from '@/lib/query-cache'
import type {
  PriorityFilter,
  QueryResponse,
  QuotaStatus,
  StatusFilter,
  TaskItem,
  TaskTabState,
} from './task-page-types'

type ProjectSummary = {
  id: string
  name: string
  identity: { id: string; name: string } | null
}

type IdentitySummary = {
  id: string
  name: string
}

type RecentEmail = {
  id: string
  subject: string
  sender: string
  receivedAt: string
  project: { id: string; name: string } | null
}

export function useTasksPageData(input: {
  statusFilter: StatusFilter
  priorityFilter: PriorityFilter
  sortBy: string
  showCreateModal: boolean
  showPasteTextModal: boolean
  selectedIdentityId: string
  selectedProjectId: string
  linkedEmailIds: string[]
  emailPickerQuery: string
  plan?: string | null
}) {
  const {
    statusFilter,
    priorityFilter,
    sortBy,
    showCreateModal,
    showPasteTextModal,
    selectedIdentityId,
    selectedProjectId,
    linkedEmailIds,
    emailPickerQuery,
    plan,
  } = input

  const queryClient = useQueryClient()

  const { data: quotaRes } = useQuery<{ data: QuotaStatus }>({
    queryKey: ['quota'],
    queryFn: () => fetch('/api/settings/quota').then((r) => r.json()),
    enabled: plan === 'free',
    staleTime: CACHE_TIME.list,
  })
  const pasteTextQuota = quotaRes?.data?.pasteText

  const apiStatus = statusFilter === 'all' ? '' : statusFilter
  const apiScope = statusFilter === 'all' ? 'open' : ''
  const apiPriority = priorityFilter === 'all' ? '' : priorityFilter

  const { data: res, isLoading } = useQuery({
    queryKey: ['tasks', apiScope || apiStatus, sortBy, apiPriority],
    queryFn: () =>
      fetch(`/api/tasks?${apiScope ? `scope=${apiScope}` : `status=${apiStatus}`}&sort=${sortBy}&limit=2000${apiPriority ? `&priority=${apiPriority}` : ''}`).then((r) => r.json()),
    staleTime: CACHE_TIME.list,
    placeholderData: (previous) => previous,
  })

  const { data: tabStatesRes } = useQuery<{ data: TaskTabState[] }>({
    queryKey: ['tasks', 'tab-states'],
    queryFn: () => fetch('/api/tasks/tab-states').then((r) => r.json()),
    staleTime: 0,
  })

  const markTabSeenMutation = useMutation({
    mutationFn: async (bucket: StatusFilter) => {
      const res = await fetch('/api/tasks/tab-states/seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json?.error?.message || 'Failed to mark tab seen')
      return bucket
    },
    onSuccess: (bucket) => {
      queryClient.setQueryData<{ data: TaskTabState[] }>(['tasks', 'tab-states'], (current) => {
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

  const tabStateMap = useMemo(() => {
    const map = new Map<StatusFilter, TaskTabState>()
    for (const state of tabStatesRes?.data ?? []) map.set(state.bucket, state)
    return map
  }, [tabStatesRes?.data])
  const activeTabNewCount = tabStateMap.get(statusFilter)?.newCount ?? 0

  useEffect(() => {
    if (!tabStatesRes?.data || activeTabNewCount <= 0) return
    markTabSeenMutation.mutate(statusFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, activeTabNewCount, tabStatesRes?.data])

  const { data: projectsRes } = useQuery({
    queryKey: ['projects'],
    queryFn: () => fetch('/api/projects').then((r) => r.json()),
    staleTime: CACHE_TIME.list,
  })
  const projects = useMemo<ProjectSummary[]>(
    () => projectsRes?.data ?? [],
    [projectsRes]
  )

  const { data: identitiesRes } = useQuery({
    queryKey: ['identities'],
    queryFn: () => fetch('/api/identities').then((r) => r.json()),
    staleTime: CACHE_TIME.list,
    enabled: showCreateModal || showPasteTextModal,
  })
  const identities = useMemo<IdentitySummary[]>(
    () => identitiesRes?.data ?? [],
    [identitiesRes]
  )

  const { data: recentEmailsRes } = useQuery({
    queryKey: ['recent-emails-for-link'],
    queryFn: () => fetch('/api/emails?page=1&limit=50').then((r) => r.json()),
    staleTime: CACHE_TIME.list,
    enabled: showCreateModal,
  })

  const { data: retentionPolicyRes } = useQuery({
    queryKey: ['retention-policy'],
    queryFn: () => fetch('/api/settings/retention-policy').then((r) => r.json()),
    staleTime: CACHE_TIME.list,
  })
  const taskRetainAfterDays: number = retentionPolicyRes?.data?.taskRetainAfterDays ?? 30

  const updateTaskRetainMutation = useMutation({
    mutationFn: async (days: number) => {
      const res = await fetch('/api/settings/retention-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskRetainAfterDays: days }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message || 'Failed to update auto-cleanup')
      return json
    },
    onSuccess: () => {
      toast.success('Auto-cleanup updated')
      queryClient.invalidateQueries({ queryKey: ['retention-policy'] })
    },
    onError: (err: Error) => showError(err.message),
  })

  const recentEmails = useMemo<RecentEmail[]>(
    () => recentEmailsRes?.data ?? [],
    [recentEmailsRes]
  )

  const filteredProjects = useMemo(() => {
    if (!selectedIdentityId) return projects
    return projects.filter((project) => project.identity?.id === selectedIdentityId)
  }, [projects, selectedIdentityId])

  const filteredEmails = useMemo(() => {
    let list = recentEmails
    if (selectedProjectId) {
      list = list.filter((email) => email.project?.id === selectedProjectId)
    } else if (selectedIdentityId) {
      const projectIdsInIdentity = new Set(filteredProjects.map((project) => project.id))
      list = list.filter((email) => email.project && projectIdsInIdentity.has(email.project.id))
    }
    const query = emailPickerQuery.trim().toLowerCase()
    if (query) {
      list = list.filter((email) =>
        email.subject?.toLowerCase().includes(query) || email.sender?.toLowerCase().includes(query)
      )
    }
    return list
  }, [recentEmails, emailPickerQuery, selectedProjectId, selectedIdentityId, filteredProjects])

  const linkedEmails = useMemo(
    () => recentEmails.filter((email) => linkedEmailIds.includes(email.id)),
    [recentEmails, linkedEmailIds]
  )

  const selectedIdentityName = selectedIdentityId
    ? identities.find((identity) => identity.id === selectedIdentityId)?.name
    : undefined
  const selectedProjectName = selectedProjectId
    ? projects.find((project) => project.id === selectedProjectId)?.name
    : undefined

  const tasks = ((res as QueryResponse<TaskItem[]>)?.data || []) as TaskItem[]

  return {
    res,
    isLoading,
    tasks,
    pasteTextQuota,
    tabStateMap,
    projects,
    identities,
    recentEmails,
    taskRetainAfterDays,
    updateTaskRetainMutation,
    filteredProjects,
    filteredEmails,
    linkedEmails,
    selectedIdentityName,
    selectedProjectName,
  }
}
