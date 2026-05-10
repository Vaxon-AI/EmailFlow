'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { InlineNotice } from '@/components/inline-notice'
import { PageHeader } from '@/components/page-header'
import { MonthYearPanel } from '@/components/month-year-panel'
import { SegmentedControl } from '@/components/segmented-control'
import { StatePanel } from '@/components/state-panel'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Check, X, Calendar, List, GanttChart, ChevronLeft, ChevronRight,
  Mail, Clock, ThumbsUp, Plus, FolderOpen, Trash2,
  ChevronDown, UserRound, Sparkles, MoreHorizontal,
} from 'lucide-react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Suspense, useState, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { GanttTimeline } from '@/components/gantt-timeline'
import { ReassignProjectModal } from '@/components/reassign-project-modal'
import { BatchReassignModal } from '@/components/batch-reassign-modal'
import { UpgradeModal } from '@/components/upgrade-modal'
import { useAuth } from '@/lib/use-auth'
import { InlineEditableName } from '@/components/inline-editable-name'
import { getPriorityBand, getPriorityColor, getPriorityLabel, getTaskStatusLabel } from '@/types'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'
import { CACHE_TIME } from '@/lib/query-cache'

type ViewMode = 'list' | 'timeline' | 'calendar'
type TaskStatus = 'pending' | 'confirmed' | 'completed' | 'dismissed'
type StatusFilter = 'all' | 'pending' | 'confirmed' | 'completed'

type TaskEmailLink = {
  email?: {
    sender?: string | null
    threadId?: string | null
  } | null
}

type TaskProject = {
  id: string
  name: string
  identity: { id: string; name: string } | null
} | null

type TaskItem = {
  id: string
  title: string
  summary?: string | null
  status: TaskStatus
  startDate?: string | null
  priorityScore?: number | null
  explicitDeadline?: string | null
  inferredDeadline?: string | null
  userSetDeadline?: string | null
  emailLinks?: TaskEmailLink[]
  project?: TaskProject
  matter?: { id: string; title: string } | null
  source?: string | null
  createdAt?: string
}

type TaskUpdateData = {
  status?: TaskStatus
  startDate?: string | null
  userSetDeadline?: string | null
}

type TaskUpdateVars = {
  id: string
  data: TaskUpdateData
}

type MutationLike = {
  mutate: (vars: TaskUpdateVars, options?: { onSuccess?: () => void; onError?: () => void }) => void
}

type QueryResponse<T> = {
  data?: T
  meta?: {
    totalCount?: number
  }
}

type CreateTaskResponse = {
  data: {
    id: string
  }
}

type TaskDraft = {
  title: string
  summary: string
  actionItems: string[]
  explicitDeadline: string | null
  inferredDeadline: string | null
  deadlineConfidence: number
  urgency: number
  impact: number
  priorityScore: number
  priorityReason?: string
  splitReason: string | null
}

type QuotaStatus = {
  pasteText?: {
    used: number
    limit: number | null
    resetAt: string
  }
}

const PRIORITY_LEVELS: Record<string, { urgency: number; impact: number; score: number }> = {
  critical: { urgency: 5, impact: 4, score: 20 },
  high: { urgency: 4, impact: 4, score: 16 },
  medium: { urgency: 3, impact: 3, score: 9 },
  low: { urgency: 2, impact: 2, score: 4 },
}

function priorityBucketFromScore(score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (score >= 20) return 'critical'
  if (score >= 12) return 'high'
  if (score >= 6) return 'medium'
  return 'low'
}

const PRIORITY_LABELS: Record<'critical' | 'high' | 'medium' | 'low', string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'AI Suggestions' },
  { value: 'confirmed', label: 'Active' },
  { value: 'completed', label: 'Completed' },
]

const PRIORITY_OPTIONS = [
  { value: 'all', label: 'All priorities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

type PriorityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low'

export default function TasksPage() {
  return (
    <Suspense fallback={null}>
      <TasksContent />
    </Suspense>
  )
}

function TasksContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const focusProjectId = searchParams.get('project') ?? undefined
  const statusFilter = parseStatusFilter(searchParams.get('status'))
  const initialPriority = parsePriorityFilter(searchParams.get('priority'))
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>(initialPriority)
  const [dateFilter, setDateFilter] = useState<{ from?: Date; to?: Date } | null>(() => {
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    if (!from && !to) return null
    return {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    }
  })
  const [sortBy, setSortBy] = useState('priority')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showPasteTextModal, setShowPasteTextModal] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskSummary, setTaskSummary] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)
  const [reassignTask, setReassignTask] = useState<TaskItem | null>(null)
  const [selection, setSelection] = useState<{ status: StatusFilter; ids: Set<string> }>({
    status: statusFilter,
    ids: new Set(),
  })
  const selectedIds = useMemo(
    () => (selection.status === statusFilter ? selection.ids : new Set<string>()),
    [selection, statusFilter]
  )
  const setSelectedIds = useCallback((updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    setSelection((prev) => {
      const current = prev.status === statusFilter ? prev.ids : new Set<string>()
      const ids = typeof updater === 'function' ? updater(current) : updater
      return { status: statusFilter, ids }
    })
  }, [statusFilter])
  const [showBatchReassign, setShowBatchReassign] = useState(false)
  // Paste Text AI extraction state
  const [extractText, setExtractText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [draftActionItems, setDraftActionItems] = useState<string[]>([])
  const [draftDeadline, setDraftDeadline] = useState('')
  const [draftStartDate, setDraftStartDate] = useState('')
  const [suggestingDates, setSuggestingDates] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [draftUrgency, setDraftUrgency] = useState(3)
  const [draftImpact, setDraftImpact] = useState(3)
  const [draftPriorityScore, setDraftPriorityScore] = useState(9)
  const [draftSource, setDraftSource] = useState('manual')
  const [selectedIdentityId, setSelectedIdentityId] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [linkedEmailIds, setLinkedEmailIds] = useState<string[]>([])
  const [emailPickerOpen, setEmailPickerOpen] = useState(false)
  const [emailPickerQuery, setEmailPickerQuery] = useState('')
  const [draftCards, setDraftCards] = useState<TaskDraft[]>([])
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isPro = Boolean(user?.plan && user.plan !== 'free')
  const priorityFilterLabel = PRIORITY_OPTIONS.find((option) => option.value === priorityFilter)?.label ?? 'All priorities'

  const { data: quotaRes } = useQuery<{ data: QuotaStatus }>({
    queryKey: ['quota'],
    queryFn: () => fetch('/api/settings/quota').then((r) => r.json()),
    enabled: user?.plan === 'free',
    staleTime: CACHE_TIME.list,
  })
  const pasteTextQuota = quotaRes?.data?.pasteText

  // "All" means all currently actionable tasks. Completed tasks stay in the
  // dedicated Completed tab.
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

  const { data: projectsRes } = useQuery({
    queryKey: ['projects'],
    queryFn: () => fetch('/api/projects').then((r) => r.json()),
    staleTime: CACHE_TIME.list,
  })
  const projects = useMemo<{ id: string; name: string; identity: { id: string; name: string } | null }[]>(
    () => projectsRes?.data ?? [],
    [projectsRes]
  )

  const { data: identitiesRes } = useQuery({
    queryKey: ['identities'],
    queryFn: () => fetch('/api/identities').then((r) => r.json()),
    staleTime: CACHE_TIME.list,
    enabled: showCreateModal || showPasteTextModal,
  })
  const identities = useMemo<{ id: string; name: string }[]>(
    () => identitiesRes?.data ?? [],
    [identitiesRes]
  )

  const { data: recentEmailsRes } = useQuery({
    queryKey: ['recent-emails-for-link'],
    queryFn: () => fetch('/api/emails?page=1&limit=50').then((r) => r.json()),
    staleTime: CACHE_TIME.list,
    enabled: showCreateModal,
  })

  // Cleanup retention shared with settings page — same query key, same cache.
  const { data: retentionPolicyRes } = useQuery({
    queryKey: ['retention-policy'],
    queryFn: () => fetch('/api/settings/retention-policy').then((r) => r.json()),
    staleTime: CACHE_TIME.list,
  })
  const taskRetainAfterDays: number =
    retentionPolicyRes?.data?.taskRetainAfterDays ?? 30
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
  const recentEmails = useMemo<{
    id: string
    subject: string
    sender: string
    receivedAt: string
    project: { id: string; name: string } | null
  }[]>(
    () => recentEmailsRes?.data ?? [],
    [recentEmailsRes]
  )

  const filteredProjects = useMemo(() => {
    if (!selectedIdentityId) return projects
    return projects.filter((p) => p.identity?.id === selectedIdentityId)
  }, [projects, selectedIdentityId])

  const filteredEmails = useMemo(() => {
    let list = recentEmails
    if (selectedProjectId) {
      list = list.filter((e) => e.project?.id === selectedProjectId)
    } else if (selectedIdentityId) {
      const projectIdsInIdentity = new Set(filteredProjects.map((p) => p.id))
      list = list.filter((e) => e.project && projectIdsInIdentity.has(e.project.id))
    }
    const q = emailPickerQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((e) =>
        e.subject?.toLowerCase().includes(q) || e.sender?.toLowerCase().includes(q)
      )
    }
    return list
  }, [recentEmails, emailPickerQuery, selectedProjectId, selectedIdentityId, filteredProjects])

  const linkedEmails = useMemo(
    () => recentEmails.filter((e) => linkedEmailIds.includes(e.id)),
    [recentEmails, linkedEmailIds]
  )

  const selectedIdentityName = selectedIdentityId
    ? identities.find((i) => i.id === selectedIdentityId)?.name
    : undefined
  const selectedProjectName = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId)?.name
    : undefined


  const resetCreateModal = () => {
    setTaskTitle('')
    setTaskSummary('')
    setExtractText('')
    setExtracting(false)
    setDraftActionItems([])
    setDraftDeadline('')
    setDraftStartDate('')
    setSuggestingDates(false)
    setDraftUrgency(3)
    setDraftImpact(3)
    setDraftPriorityScore(9)
    setDraftSource('manual')
    setSelectedIdentityId('')
    setSelectedProjectId('')
    setLinkedEmailIds([])
    setEmailPickerOpen(false)
    setEmailPickerQuery('')
    setDraftCards([])
  }

  const handleModalOpenChange = (open: boolean) => {
    setShowCreateModal(open)
    if (!open) resetCreateModal()
  }

  const handlePasteTextOpenChange = (open: boolean) => {
    setShowPasteTextModal(open)
    if (open) {
      setDraftSource('copy_text')
    } else {
      resetCreateModal()
    }
  }

  const handleGenerateTask = async () => {
    if (!extractText.trim()) return
    setExtracting(true)
    try {
      const res = await fetch('/api/tasks/from-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: extractText }),
      })
      if (!res.ok) {
        if (res.status === 402) {
          setShowUpgrade(true)
          return
        }
        showError('Failed to extract task')
        return
      }
      const data = await res.json()
      const tasks: TaskDraft[] = data.data?.tasks ?? []

      if (tasks.length === 0) {
        showError('No task could be extracted')
        return
      }

      setDraftSource('copy_text')
      setDraftCards(tasks)
      setTaskTitle('')
      setTaskSummary('')
      setDraftActionItems([])
      setDraftDeadline('')
      setDraftUrgency(3)
      setDraftImpact(3)
      setDraftPriorityScore(9)
      queryClient.invalidateQueries({ queryKey: ['quota'] })
    } catch {
      showError('Failed to extract task')
    } finally {
      setExtracting(false)
    }
  }

  const updateCard = (idx: number, patch: Partial<TaskDraft>) => {
    setDraftCards((prev) => prev.map((card, i) => (i === idx ? { ...card, ...patch } : card)))
  }

  const removeCard = (idx: number) => {
    setDraftCards((prev) => prev.filter((_, i) => i !== idx))
  }

  const createOneTask = async (payload: {
    title: string
    summary: string
    actionItems: string[]
    userSetDeadline?: string
    startDate?: string
    urgency: number
    impact: number
    priorityScore: number
    emailIds?: string[]
    source?: string
  }): Promise<CreateTaskResponse> => {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: payload.title,
        summary: payload.summary,
        actionItems: payload.actionItems.length > 0 ? JSON.stringify(payload.actionItems) : undefined,
        userSetDeadline: payload.userSetDeadline || undefined,
        startDate: payload.startDate || undefined,
        urgency: payload.urgency,
        impact: payload.impact,
        priorityScore: payload.priorityScore,
        source: payload.source ?? draftSource,
        projectId: selectedProjectId || undefined,
        emailIds: payload.emailIds && payload.emailIds.length > 0 ? payload.emailIds : undefined,
      }),
    })
    if (!res.ok) throw new Error('Failed to create task')
    return res.json()
  }

  const handleSuggestDates = async () => {
    if (!taskTitle.trim()) return
    if (!isPro) { setShowUpgrade(true); return }
    setSuggestingDates(true)
    try {
      const res = await fetch('/api/tasks/suggest-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskTitle,
          summary: taskSummary,
          projectId: selectedProjectId || undefined,
        }),
      })
      if (res.status === 402) { setShowUpgrade(true); return }
      if (!res.ok) { showError('Failed to suggest dates'); return }
      const { data } = await res.json()
      if (data.startDate) setDraftStartDate(data.startDate)
      if (data.dueDate) setDraftDeadline(data.dueDate)
      if (!data.startDate && !data.dueDate) {
        toast.info('No clear date signal — leave empty or set manually.')
      } else if (data.reasoning) {
        toast.info(`AI: ${data.reasoning}`)
      }
    } catch {
      showError('Failed to suggest dates')
    } finally {
      setSuggestingDates(false)
    }
  }

  const handleCreateTask = async () => {
    if (draftCards.length > 0) {
      if (draftCards.some((c) => !c.title.trim())) {
        toast.error('Every task needs a title')
        return
      }

      setCreatingTask(true)
      const results = await Promise.allSettled(
        draftCards.map((card) =>
          createOneTask({
            title: card.title,
            summary: card.summary,
            actionItems: card.actionItems,
            userSetDeadline: card.explicitDeadline || card.inferredDeadline || undefined,
            urgency: card.urgency,
            impact: card.impact,
            priorityScore: card.priorityScore,
            source: 'copy_text',
          })
        )
      )
      setCreatingTask(false)

      const succeededCount = results.filter((r) => r.status === 'fulfilled').length
      const failedCards = draftCards.filter((_, i) => results[i].status === 'rejected')

      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })

      if (failedCards.length === 0) {
        toast.success(`${succeededCount} task${succeededCount === 1 ? '' : 's'} created`)
        setShowPasteTextModal(false)
        resetCreateModal()
      } else if (succeededCount === 0) {
        showError('Failed to create tasks')
      } else {
        toast.error(`${succeededCount} created, ${failedCards.length} failed`)
        setDraftCards(failedCards)
      }
      return
    }

    if (!taskTitle.trim()) {
      toast.error('Task title is required')
      return
    }

    setCreatingTask(true)
    try {
      const data = await createOneTask({
        title: taskTitle,
        summary: taskSummary,
        actionItems: draftActionItems,
        userSetDeadline: draftDeadline || undefined,
        startDate: draftStartDate || undefined,
        urgency: draftUrgency,
        impact: draftImpact,
        priorityScore: draftPriorityScore,
        emailIds: linkedEmailIds,
      })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Task created')
      setShowCreateModal(false)
      resetCreateModal()
      router.push(`/dashboard/tasks/${data.data.id}`)
    } catch {
      showError('Failed to create task')
    } finally {
      setCreatingTask(false)
    }
  }

  const updateTask = useMutation({
    mutationFn: ({ id, data }: TaskUpdateVars) =>
      fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const previousTasks = queryClient.getQueriesData<QueryResponse<TaskItem[]>>({ queryKey: ['tasks'] })
      previousTasks.forEach(([queryKey, cached]) => {
        if (!cached?.data) return
        const scopeOrStatus = Array.isArray(queryKey) ? queryKey[1] : undefined
        const priority = Array.isArray(queryKey) ? queryKey[3] : undefined
        const nextData = cached.data
          .map((task) => task.id === id ? { ...task, ...(data as Partial<TaskItem>) } : task)
          .filter((task) => {
            if (!matchesPriorityFilter(task, priority)) return false
            if (scopeOrStatus === 'open') return task.status === 'pending' || task.status === 'confirmed'
            if (scopeOrStatus === 'completed') return task.status === 'completed'
            if (scopeOrStatus === 'pending') return task.status === 'pending'
            if (scopeOrStatus === 'confirmed') return task.status === 'confirmed'
            return true
          })
        queryClient.setQueryData(queryKey, { ...cached, data: nextData })
      })
      return { previousTasks }
    },
    onError: (_err, _vars, context) => {
      context?.previousTasks?.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data)
      })
      showError('Failed to update task')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
  })

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })

  const clearSelection = () => setSelectedIds(new Set())

  const handlePriorityFilterChange = (value: string | null) => {
    const nextPriority = parsePriorityFilter(value)
    setPriorityFilter(nextPriority)

    const params = new URLSearchParams(searchParams.toString())
    if (nextPriority === 'all') params.delete('priority')
    else params.set('priority', nextPriority)

    const query = params.toString()
    router.replace(query ? `/dashboard/tasks?${query}` : '/dashboard/tasks', { scroll: false })
  }

  const handleStatusFilterChange = (value: string | null) => {
    const nextStatus = parseStatusFilter(value)
    setSelection({ status: nextStatus, ids: new Set() })

    const params = new URLSearchParams(searchParams.toString())
    if (nextStatus === 'all') params.delete('status')
    else params.set('status', nextStatus)

    const query = params.toString()
    router.replace(query ? `/dashboard/tasks?${query}` : '/dashboard/tasks', { scroll: false })
  }

  const bulkToggle = useCallback((ids: string[], select: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (select) ids.forEach((id) => next.add(id))
      else ids.forEach((id) => next.delete(id))
      return next
    })
  }, [setSelectedIds])

  const selectAll = () => setSelectedIds(new Set(tasks.map((t) => t.id)))

  const handleDeleteTask = async (taskId: string) => {
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['stats'] })
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(taskId); return next })
    toast.success('Task deleted')
  }

  const batchOp = async (action: 'complete' | 'confirm' | 'delete') => {
    const ids = [...selectedIds]
    await fetch('/api/tasks/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action }),
    })
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['stats'] })
    clearSelection()
    const label = action === 'complete' ? 'completed' : action === 'confirm' ? 'activated' : 'deleted'
    toast.success(`${ids.length} task${ids.length === 1 ? '' : 's'} ${label}`)
  }

  const tasks = useMemo(() => {
    const raw = ((res as QueryResponse<TaskItem[]>)?.data || []) as TaskItem[]
    if (!dateFilter) return raw
    return raw.filter((t) => {
      if (!t.createdAt) return true
      const created = new Date(t.createdAt)
      if (dateFilter.from && created < dateFilter.from) return false
      if (dateFilter.to) {
        const end = new Date(dateFilter.to)
        end.setHours(23, 59, 59, 999)
        if (created > end) return false
      }
      return true
    })
  }, [res, dateFilter])

  const clearDateFilter = useCallback(() => {
    setDateFilter(null)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('from')
    params.delete('to')
    const q = params.toString()
    router.replace(q ? `/dashboard/tasks?${q}` : '/dashboard/tasks', { scroll: false })
  }, [router, searchParams])

  const handleIdentityChange = (next: string) => {
    setSelectedIdentityId(next)
    if (selectedProjectId) {
      const proj = projects.find((p) => p.id === selectedProjectId)
      if (next && proj?.identity?.id !== next) setSelectedProjectId('')
    }
  }

  const identityProjectPicker = (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        <Label>Identity <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Select
          value={selectedIdentityId || '__none__'}
          onValueChange={(v) => handleIdentityChange(v === '__none__' ? '' : (v ?? ''))}
        >
          <SelectTrigger className="h-9 w-full text-sm">
            <SelectValue>
              {selectedIdentityName ?? <span className="text-muted-foreground">Any identity</span>}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Any identity</SelectItem>
            {identities.map((id) => (
              <SelectItem key={id.id} value={id.id}>{id.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Project <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Select
          value={selectedProjectId || '__none__'}
          onValueChange={(v) => setSelectedProjectId(v === '__none__' ? '' : (v ?? ''))}
        >
          <SelectTrigger className="h-9 w-full text-sm">
            <SelectValue>
              {selectedProjectName ?? <span className="text-muted-foreground">Uncategorized</span>}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Uncategorized</SelectItem>
            {filteredProjects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <div className="flex flex-col py-0.5">
                  <span className="font-medium">{p.name}</span>
                  {p.identity && !selectedIdentityId && (
                    <span className="text-xs text-muted-foreground">{p.identity.name}</span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )

  const linkedEmailPicker = (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Linked emails <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Popover open={emailPickerOpen} onOpenChange={setEmailPickerOpen}>
          <PopoverTrigger
            render={
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs">
                <Mail className="mr-1 size-3.5" />
                {linkedEmailIds.length > 0 ? `${linkedEmailIds.length} linked` : 'Link email'}
              </Button>
            }
          />
          <PopoverContent className="w-[360px] p-0" align="end">
            <div className="space-y-2 border-b p-2">
              {(selectedProjectName || (selectedIdentityName && !selectedProjectName)) && (
                <div className="px-1 text-[11px] text-muted-foreground">
                  Showing emails from{' '}
                  <span className="font-medium text-foreground">
                    {selectedProjectName ?? `${selectedIdentityName} projects`}
                  </span>
                </div>
              )}
              <Input
                placeholder="Search by subject or sender..."
                value={emailPickerQuery}
                onChange={(e) => setEmailPickerQuery(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="max-h-[260px] overflow-y-auto">
              {filteredEmails.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  {recentEmails.length === 0
                    ? 'No emails available'
                    : selectedProjectName
                      ? 'No emails for this project in the recent 50'
                      : 'No emails match your search'}
                </div>
              ) : (
                filteredEmails.map((e) => {
                  const linked = linkedEmailIds.includes(e.id)
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => {
                        setLinkedEmailIds((prev) =>
                          prev.includes(e.id) ? prev.filter((id) => id !== e.id) : [...prev, e.id]
                        )
                      }}
                      className={`flex w-full items-start gap-2 border-b border-border/50 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50 ${linked ? 'bg-brand-50' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{e.subject || '(no subject)'}</div>
                        <div className="truncate text-muted-foreground">{e.sender}</div>
                      </div>
                      {linked && <Check className="size-3.5 shrink-0 text-brand-600" />}
                    </button>
                  )
                })
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {linkedEmails.length > 0 && (
        <div className="space-y-1">
          {linkedEmails.map((e) => (
            <div key={e.id} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
              <Mail className="size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{e.subject || '(no subject)'}</div>
                <div className="truncate text-[11px] text-muted-foreground">{e.sender}</div>
              </div>
              <button
                type="button"
                onClick={() => setLinkedEmailIds(linkedEmailIds.filter((id) => id !== e.id))}
                aria-label="Remove email link"
                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tasks"
        description="Track what needs review, what is active, and what is already done."
        meta={`${res?.meta?.totalCount || 0} tasks`}
        actions={
          <>
            <SegmentedControl
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: 'list', label: 'List', icon: <List className="h-3.5 w-3.5" /> },
                { value: 'timeline', label: 'Timeline', icon: <GanttChart className="h-3.5 w-3.5" /> },
                { value: 'calendar', label: 'Calendar', icon: <Calendar className="h-3.5 w-3.5" /> },
              ]}
            />
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-8 items-center gap-2 rounded-md bg-brand-600 px-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200">
                <Plus className="h-4 w-4" />
                Create Task
                <ChevronDown className="h-3.5 w-3.5 opacity-80" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => {
                    setDraftSource('manual')
                    setShowCreateModal(true)
                  }}
                  className="cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>Manual Task</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handlePasteTextOpenChange(true)}
                  className="cursor-pointer"
                >
                  <Sparkles className="h-4 w-4" />
                  <span className="flex-1">Paste Text</span>
                  {!isPro && pasteTextQuota?.limit ? (
                    <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-violet-700">
                      {pasteTextQuota.used}/{pasteTextQuota.limit}
                    </span>
                  ) : null}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {dateFilter ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-100 bg-brand-50/70 px-4 py-2.5 text-sm">
          <span className="text-brand-700">
            Showing tasks from{' '}
            <strong>{dateFilter.from?.toLocaleDateString() || '—'}</strong>
            {dateFilter.to ? <> to <strong>{dateFilter.to.toLocaleDateString()}</strong></> : null}
          </span>
          <button
            type="button"
            onClick={clearDateFilter}
            className="shrink-0 rounded-full px-3 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100"
          >
            Clear date
          </button>
        </div>
      ) : null}

      {/* Filter bar */}
      <div className="rounded-2xl border border-white/70 bg-white/90 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              value={statusFilter}
              onChange={handleStatusFilterChange}
              options={STATUS_OPTIONS}
            />
            {/* Cleanup options live next to the Completed tab — only relevant there. */}
            {statusFilter === 'completed' && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
                  title="Cleanup options for completed tasks"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-60">
                  <div className="px-2 py-1.5 space-y-1.5">
                    <p className="text-xs font-semibold text-gray-500">Auto-clean completed</p>
                    <Select
                      value={String(taskRetainAfterDays)}
                      onValueChange={(v) => updateTaskRetainMutation.mutate(Number(v))}
                    >
                      <SelectTrigger size="sm" className="w-full bg-white">
                        <SelectValue>{taskRetainAfterDays} days</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7 days</SelectItem>
                        <SelectItem value="14">14 days</SelectItem>
                        <SelectItem value="30">30 days</SelectItem>
                        <SelectItem value="60">60 days</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-gray-400 leading-snug">
                      Standalone tasks deleted; tasks linked to emails are archived until the source emails are also removed.
                    </p>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div className="flex min-h-7 justify-start sm:min-w-[180px] sm:justify-end">
            {viewMode === 'list' ? (
              <div className="flex flex-wrap items-center gap-2">
                <Select value={priorityFilter} onValueChange={handlePriorityFilterChange}>
                  <SelectTrigger size="sm" className="bg-white">
                    <SelectValue>{priorityFilterLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <SegmentedControl
                  value={sortBy}
                  onChange={setSortBy}
                  options={[
                    { value: 'priority', label: 'Priority' },
                    { value: 'deadline', label: 'Deadline' },
                  ]}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/80 px-4 py-2.5 shadow-sm">
          <span className="text-sm font-medium text-brand-700">{selectedIds.size} selected</span>
          {selectedIds.size < tasks.length && (
            <button onClick={selectAll} className="text-xs text-brand-500 hover:text-brand-700 hover:underline">
              Select all {tasks.length}
            </button>
          )}
          <div className="flex-1" />
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => batchOp('confirm')}>
            <ThumbsUp className="mr-1 h-3 w-3" /> Activate
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => batchOp('complete')}>
            <Check className="mr-1 h-3 w-3" /> Mark Done
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setShowBatchReassign(true)}>
            <FolderOpen className="h-3 w-3" /> Change Project
          </Button>
          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => batchOp('delete')}>
            <Trash2 className="mr-1 h-3 w-3" /> Delete
          </Button>
          <button onClick={clearSelection} className="ml-1 rounded p-1 text-brand-400 hover:bg-brand-100 hover:text-brand-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Content */}
      <div className="min-w-0">
        {isLoading ? (
          <StatePanel
            loading
            title="Loading tasks"
            description="Pulling together your current work items."
          />
        ) : tasks.length === 0 ? (
          <StatePanel
            icon={<FolderOpen className="h-5 w-5 text-gray-400" />}
            title="No tasks found"
            description="Try a different filter or create a task manually."
          />
        ) : viewMode === 'list' ? (
          <TaskListView
            tasks={tasks}
            updateTask={updateTask}
            focusProjectId={focusProjectId}
            onReassign={setReassignTask}
            onDelete={handleDeleteTask}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onBulkToggle={bulkToggle}
          />
        ) : viewMode === 'timeline' ? (
          <GanttTimeline tasks={tasks} updateTask={updateTask} />
        ) : (
          <TaskCalendarView tasks={tasks} updateTask={updateTask} />
        )}
      </div>

      {/* Reassign Project Modal */}
      <ReassignProjectModal
        open={!!reassignTask}
        onOpenChange={(open) => { if (!open) setReassignTask(null) }}
        threadId={reassignTask?.emailLinks?.[0]?.email?.threadId ?? undefined}
        taskId={!reassignTask?.emailLinks?.[0]?.email?.threadId ? reassignTask?.id : undefined}
        currentProject={reassignTask?.project}
        invalidateKeys={[['tasks']]}
      />

      {/* Batch Reassign Modal */}
      <BatchReassignModal
        open={showBatchReassign}
        onOpenChange={setShowBatchReassign}
        ids={[...selectedIds]}
        onSuccess={clearSelection}
      />

      <UpgradeModal open={showUpgrade} onOpenChange={setShowUpgrade} />

      {/* Paste Text Modal */}
      <Dialog open={showPasteTextModal} onOpenChange={handlePasteTextOpenChange}>
        <DialogContent className={draftCards.length > 0 ? 'sm:max-w-lg' : 'sm:max-w-md'}>
          <DialogHeader>
            <DialogTitle>{draftCards.length > 0 ? `Review ${draftCards.length} suggested tasks` : 'Paste Text'}</DialogTitle>
            <DialogDescription>
              {draftCards.length > 0
                ? 'AI suggested separate tasks from your pasted text. Edit or remove any before creating.'
                : 'Paste notes, messages, or rough text and let AI extract actionable tasks.'}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-1 space-y-4">
            {!isPro && pasteTextQuota?.limit ? (
              <div className="flex items-center justify-between rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-xs text-violet-700">
                <span className="font-medium">Free Paste Text trial</span>
                <span className="tabular-nums">{pasteTextQuota.used}/{pasteTextQuota.limit}</span>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="paste-text-input">Text to extract</Label>
              <Textarea
                id="paste-text-input"
                value={extractText}
                onChange={(e) => setExtractText(e.target.value.slice(0, 1000))}
                placeholder="Paste meeting notes, chat messages, or any text..."
                rows={5}
                className="resize-none text-sm"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{extractText.length}/1000</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerateTask}
                  disabled={extracting || !extractText.trim()}
                >
                  <Sparkles className="size-3.5 mr-1.5" />
                  {extracting ? 'Generating...' : 'Generate Tasks'}
                </Button>
              </div>
            </div>

            {draftCards.length > 0 ? (
              <>
                <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
                  {draftCards.map((card, idx) => (
                    <DraftCard
                      key={idx}
                      card={card}
                      onChange={(patch) => updateCard(idx, patch)}
                      onRemove={() => removeCard(idx)}
                    />
                  ))}
                </div>

                {identityProjectPicker}
              </>
            ) : null}
          </div>

          <DialogFooter className="mt-2">
            <DialogClose
              render={<Button className="flex-1" variant="outline" />}
            >
              Cancel
            </DialogClose>
            <Button
              onClick={handleCreateTask}
              disabled={
                creatingTask ||
                draftCards.length === 0 ||
                draftCards.some((c) => !c.title.trim())
              }
              className="flex-1"
            >
              {creatingTask
                ? 'Creating...'
                : draftCards.length > 0
                  ? `Create ${draftCards.length} Task${draftCards.length === 1 ? '' : 's'}`
                  : 'Create Tasks'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Task Modal */}
      <Dialog open={showCreateModal} onOpenChange={handleModalOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
            <DialogDescription>
              Add a manual task when work starts outside the email pipeline.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-1 space-y-4">
            {!taskTitle.trim() && creatingTask ? (
              <InlineNotice variant="warning">A task title is required before you can create it.</InlineNotice>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="manual-task-title">Task Title</Label>
              <Input
                id="manual-task-title"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Enter task title"
                className="h-10"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleCreateTask() }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-task-summary">Summary <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="manual-task-summary"
                value={taskSummary}
                onChange={(e) => setTaskSummary(e.target.value)}
                placeholder="Brief description"
                rows={3}
                className="resize-none"
              />
            </div>

            {identityProjectPicker}

            {linkedEmailPicker}

            <div className="space-y-2">
              <Label>Checklist <span className="text-muted-foreground font-normal">(optional)</span></Label>
              {draftActionItems.length > 0 && (
                <div className="space-y-1.5">
                  {draftActionItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={item}
                        onChange={(e) => {
                          const next = [...draftActionItems]
                          next[i] = e.target.value
                          setDraftActionItems(next)
                        }}
                        className="h-8 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setDraftActionItems(draftActionItems.filter((_, j) => j !== i))}
                        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setDraftActionItems([...draftActionItems, ''])}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="size-3.5" /> Add item
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Dates <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleSuggestDates}
                  disabled={!taskTitle.trim() || suggestingDates}
                  className="h-7 gap-1 text-xs"
                >
                  <Sparkles className="size-3" />
                  {suggestingDates ? 'Suggesting...' : 'Suggest dates'}
                  {!isPro && (
                    <Badge className="ml-1 h-4 bg-brand-100 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700 hover:bg-brand-100">
                      Pro
                    </Badge>
                  )}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="draft-start-date" className="text-xs text-muted-foreground">Start date</Label>
                  <Input
                    id="draft-start-date"
                    type="date"
                    value={draftStartDate}
                    onChange={(e) => setDraftStartDate(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="draft-deadline" className="text-xs text-muted-foreground">Due date</Label>
                  <Input
                    id="draft-deadline"
                    type="date"
                    value={draftDeadline}
                    onChange={(e) => setDraftDeadline(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={priorityBucketFromScore(draftPriorityScore)}
                onValueChange={(v) => {
                  if (!v) return
                  const p = PRIORITY_LEVELS[v]
                  if (p) { setDraftUrgency(p.urgency); setDraftImpact(p.impact); setDraftPriorityScore(p.score) }
                }}
              >
                <SelectTrigger className="h-8 w-full text-sm">
                  <SelectValue>{PRIORITY_LABELS[priorityBucketFromScore(draftPriorityScore)]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <DialogClose
              render={<Button className="flex-1" variant="outline" />}
            >
              Cancel
            </DialogClose>
            <Button
              onClick={handleCreateTask}
              disabled={creatingTask || !taskTitle.trim()}
              className="flex-1"
            >
              {creatingTask ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function parsePriorityFilter(value: string | null): PriorityFilter {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low' ? value : 'all'
}

function parseStatusFilter(value: string | null): StatusFilter {
  return value === 'pending' || value === 'confirmed' || value === 'completed' ? value : 'all'
}

function matchesPriorityFilter(task: TaskItem, priority: unknown) {
  if (priority !== 'critical' && priority !== 'high' && priority !== 'medium' && priority !== 'low') return true
  return getPriorityBand(task.priorityScore || 0) === priority
}

/* ========== DRAFT CARD - one suggested task in the multi-candidate review list ========== */
function DraftCard({
  card,
  onChange,
  onRemove,
}: {
  card: TaskDraft
  onChange: (patch: Partial<TaskDraft>) => void
  onRemove: () => void
}) {
  const deadline = card.explicitDeadline || card.inferredDeadline || ''
  const priorityBucket = priorityBucketFromScore(card.priorityScore)

  return (
    <div className="relative rounded-lg border bg-card p-3 space-y-2">
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove this task"
        className="absolute right-2 top-2 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
      >
        <X className="size-3.5" />
      </button>

      <Input
        value={card.title}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder="Task title"
        className="h-9 pr-7 text-sm font-medium"
      />

      {card.splitReason && (
        <p className="text-[11px] italic text-muted-foreground">{card.splitReason}</p>
      )}

      {card.summary && (
        <Textarea
          value={card.summary}
          onChange={(e) => onChange({ summary: e.target.value })}
          rows={2}
          className="resize-none text-xs"
        />
      )}

      {card.actionItems.length > 0 && (
        <div className="space-y-1">
          {card.actionItems.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                value={item}
                onChange={(e) => {
                  const next = [...card.actionItems]
                  next[i] = e.target.value
                  onChange({ actionItems: next })
                }}
                className="h-7 text-xs"
              />
              <button
                type="button"
                onClick={() => onChange({ actionItems: card.actionItems.filter((_, j) => j !== i) })}
                className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => onChange({ actionItems: [...card.actionItems, ''] })}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Plus className="size-3" /> Add item
      </button>

      <div className="flex gap-2">
        <Input
          type="date"
          value={deadline}
          onChange={(e) => onChange({ explicitDeadline: e.target.value || null, inferredDeadline: null })}
          className="h-7 flex-1 text-xs"
        />
        <Select
          value={priorityBucket}
          onValueChange={(v) => {
            if (!v) return
            const p = PRIORITY_LEVELS[v]
            if (p) onChange({ urgency: p.urgency, impact: p.impact, priorityScore: p.score })
          }}
        >
          <SelectTrigger className="h-7 w-[110px] text-xs">
            <SelectValue>{PRIORITY_LABELS[priorityBucket]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

/* ========== LIST VIEW - 2-level collapsible: identity -> project ========== */
function TaskListView({ tasks, updateTask, focusProjectId, onReassign, onDelete, selectedIds, onToggleSelect, onBulkToggle }: {
  tasks: TaskItem[]
  updateTask: MutationLike
  focusProjectId?: string
  onReassign: (task: TaskItem) => void
  onDelete: (id: string) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onBulkToggle: (ids: string[], select: boolean) => void
}) {
  type ProjectGroup = { id: string; name: string; items: TaskItem[] }
  type IdentityGroup = { id: string; name: string; projects: ProjectGroup[] }

  const queryClient = useQueryClient()
  const [collapsedIdentities, setCollapsedIdentities] = useState<Set<string>>(new Set())
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())
  const [userHasToggled, setUserHasToggled] = useState(false)

  const renameProject = async (projectId: string, name: string) => {
    await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
  }

  const renameIdentity = async (identityId: string, name: string) => {
    await fetch(`/api/identities/${identityId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['identities'] })
  }

  const toggleIdentity = (id: string) => {
    setUserHasToggled(true)
    setCollapsedIdentities((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleProject = (id: string) => {
    setUserHasToggled(true)
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const sortItemsWithinGroup = useCallback((items: TaskItem[]) => {
    const active = items.filter((task) => task.status !== 'completed')
    const done = items.filter((task) => task.status === 'completed')
    return [...active, ...done]
  }, [])

  const { identityGroups, ungrouped } = useMemo(() => {
    const ungrouped: TaskItem[] = []
    const identityMap = new Map<string, { name: string; projectMap: Map<string, { name: string; items: TaskItem[] }> }>()

    for (const task of tasks) {
      if (!task.project) { ungrouped.push(task); continue }
      const iId = task.project.identity?.id || '__unassigned__'
      const iName = task.project.identity?.name || 'Unassigned'
      const pId = task.project.id
      const pName = task.project.name
      if (!identityMap.has(iId)) identityMap.set(iId, { name: iName, projectMap: new Map() })
      const identity = identityMap.get(iId)!
      if (!identity.projectMap.has(pId)) identity.projectMap.set(pId, { name: pName, items: [] })
      identity.projectMap.get(pId)!.items.push(task)
    }

    const latestScore = (items: TaskItem[]) =>
      Math.max(...items.map((t) => t.priorityScore ?? 0))

    const identityGroups: IdentityGroup[] = Array.from(identityMap.entries())
      .map(([id, { name, projectMap }]) => {
        const projects = Array.from(projectMap.entries())
          .map(([pid, { name, items }]) => ({ id: pid, name, items: sortItemsWithinGroup(items) }))
          .sort((a, b) => latestScore(b.items) - latestScore(a.items))
        return { id, name, projects }
      })
      .sort((a, b) =>
        latestScore(b.projects.flatMap((p) => p.items)) - latestScore(a.projects.flatMap((p) => p.items))
      )

    return { identityGroups, ungrouped: sortItemsWithinGroup(ungrouped) }
  }, [sortItemsWithinGroup, tasks])

  if (tasks.length === 0) {
    return (
      <StatePanel
        icon={<FolderOpen className="h-5 w-5 text-gray-400" />}
        title="No tasks found"
        description="Try a different filter or create a task manually."
      />
    )
  }

  const ungroupedIds = ungrouped.map((t) => t.id)
  const allUngroupedSel = ungroupedIds.length > 0 && ungroupedIds.every((id) => selectedIds.has(id))
  const someUngroupedSel = ungroupedIds.some((id) => selectedIds.has(id))

  return (
    <div className="space-y-2">
      {identityGroups.map((identity) => {
        const isIdentityCollapsed = !userHasToggled && focusProjectId
          ? !identity.projects.some((p) => p.id === focusProjectId)
          : collapsedIdentities.has(identity.id)
        const totalCount = identity.projects.reduce((s, p) => s + p.items.length, 0)
        const identityTaskIds = identity.projects.flatMap((p) => p.items.map((t) => t.id))
        const allIdentitySel = identityTaskIds.length > 0 && identityTaskIds.every((id) => selectedIds.has(id))
        const someIdentitySel = identityTaskIds.some((id) => selectedIds.has(id))
        return (
          <div key={identity.id} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            {/* Identity row */}
            <div className="group flex w-full items-center gap-2.5 px-4 py-3 transition-colors hover:bg-slate-50">
              <input
                type="checkbox"
                checked={allIdentitySel}
                ref={(el) => { if (el) el.indeterminate = someIdentitySel && !allIdentitySel }}
                onChange={() => onBulkToggle(identityTaskIds, !allIdentitySel)}
                onClick={(e) => e.stopPropagation()}
                className={`h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-brand-600 transition-opacity ${allIdentitySel || someIdentitySel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
              />
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleIdentity(identity.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggleIdentity(identity.id)
                  }
                }}
                className="flex flex-1 cursor-pointer items-center gap-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 ${isIdentityCollapsed ? '-rotate-90' : ''}`} />
                <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                {identity.id === '__unassigned__'
                  ? <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">{identity.name}</span>
                  : <InlineEditableName name={identity.name} className="text-xs font-semibold uppercase tracking-widest text-slate-500" onSave={(n) => renameIdentity(identity.id, n)} />
                }
                <span className="ml-auto text-xs text-slate-400">{totalCount} task{totalCount !== 1 ? 's' : ''} shown</span>
              </div>
            </div>

            {!isIdentityCollapsed && (
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {identity.projects.map((project) => {
                  const isProjectCollapsed = !userHasToggled && focusProjectId
                    ? project.id !== focusProjectId
                    : collapsedProjects.has(project.id)
                  const projectTaskIds = project.items.map((t) => t.id)
                  const allProjectSel = projectTaskIds.length > 0 && projectTaskIds.every((id) => selectedIds.has(id))
                  const someProjectSel = projectTaskIds.some((id) => selectedIds.has(id))
                  return (
                    <div key={project.id}>
                      {/* Project row */}
                      <div className="group flex w-full items-center gap-2.5 px-5 py-2.5 transition-colors hover:bg-slate-50/70">
                        <input
                          type="checkbox"
                          checked={allProjectSel}
                          ref={(el) => { if (el) el.indeterminate = someProjectSel && !allProjectSel }}
                          onChange={() => onBulkToggle(projectTaskIds, !allProjectSel)}
                          onClick={(e) => e.stopPropagation()}
                          className={`h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-brand-600 transition-opacity ${allProjectSel || someProjectSel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        />
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleProject(project.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              toggleProject(project.id)
                            }
                          }}
                          className="flex flex-1 cursor-pointer items-center gap-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform duration-150 ${isProjectCollapsed ? '-rotate-90' : ''}`} />
                          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <InlineEditableName name={project.name} className="text-sm font-medium text-slate-700" onSave={(n) => renameProject(project.id, n)} />
                          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{project.items.length}</span>
                        </div>
                      </div>

                      {!isProjectCollapsed && (
                        <div className="space-y-2 px-4 pb-3 pt-1">
                          {project.items.map((task) => (
                            <TaskRow key={task.id} task={task} updateTask={updateTask} onReassign={onReassign} onDelete={onDelete} isSelected={selectedIds.has(task.id)} onToggleSelect={onToggleSelect} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {ungrouped.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="group flex items-center gap-2.5 px-4 py-3">
            <input
              type="checkbox"
              checked={allUngroupedSel}
              ref={(el) => { if (el) el.indeterminate = someUngroupedSel && !allUngroupedSel }}
              onChange={() => onBulkToggle(ungroupedIds, !allUngroupedSel)}
              className={`h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-brand-600 transition-opacity ${allUngroupedSel || someUngroupedSel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            />
            <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Uncategorized</span>
            <span className="ml-auto text-xs text-slate-400">{ungrouped.length} task{ungrouped.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-2 border-t border-slate-100 px-4 pb-3 pt-2">
            {ungrouped.map((task) => (
              <TaskRow key={task.id} task={task} updateTask={updateTask} onReassign={onReassign} onDelete={onDelete} isSelected={selectedIds.has(task.id)} onToggleSelect={onToggleSelect} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function formatTaskScheduleLabel(startDate?: string | null, deadline?: string | null) {
  if (!deadline) return null
  const end = new Date(deadline)
  const endLabel = end.toLocaleDateString('en', { month: 'short', day: 'numeric' })

  if (!startDate) return `Due ${endLabel}`

  const start = new Date(startDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `Due ${endLabel}`

  const startLabel = start.toLocaleDateString('en', { month: 'short', day: 'numeric' })
  return start.toDateString() === end.toDateString() ? `Due ${endLabel}` : `${startLabel} - ${endLabel}`
}

function TaskRow({ task, updateTask, onReassign, onDelete, isSelected, onToggleSelect }: {
  task: TaskItem
  updateTask: MutationLike
  onReassign: (task: TaskItem) => void
  onDelete: (id: string) => void
  isSelected: boolean
  onToggleSelect: (id: string) => void
}) {
  const band = getPriorityBand(task.priorityScore || 0)
  const deadline = task.userSetDeadline || task.explicitDeadline || task.inferredDeadline
  const startDate = task.startDate
  const scheduleLabel = formatTaskScheduleLabel(startDate, deadline)
  const isOverdue = deadline && new Date(deadline) < new Date() && (task.status === 'pending' || task.status === 'confirmed')
  const senderName = task.emailLinks?.[0]?.email?.sender?.split('<')[0]?.trim()
  const isPending = task.status === 'pending'
  const isDone = task.status === 'completed'
  const matter = task.matter ?? null

  return (
    <div
      className={`group flex items-center gap-3 rounded-xl border px-3 transition-all ${
        isSelected
          ? 'border-brand-300 bg-brand-50/50 py-3.5'
          : isPending
          ? 'border-brand-200 bg-brand-50/30 hover:border-brand-300 hover:shadow-md py-3.5'
          : isDone
          ? 'border-gray-100 bg-gray-50/50 py-2.5 opacity-60 hover:opacity-80'
          : 'border-gray-200/80 bg-white hover:border-brand-200 hover:bg-brand-50/60 hover:shadow-sm py-3.5'
      }`}
    >
      {/* Multi-select checkbox */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => { e.stopPropagation(); onToggleSelect(task.id) }}
        onClick={(e) => e.stopPropagation()}
        className={`h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-brand-600 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      />

      {/* Priority indicator — Low has no bar (still keep a spacer so all rows
          align). Red / orange / yellow trio uses dedicated tokens so the three
          hues genuinely separate. */}
      {band === 'low' ? (
        <div className="w-1 shrink-0" />
      ) : (
        <div className={`h-9 w-1 shrink-0 rounded-full ${
          band === 'critical' ? 'bg-critical' :
          band === 'high'     ? 'bg-orange' :
                                'bg-yellow'   /* medium */
        }`} />
      )}

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/tasks/${task.id}`}
            className={`truncate text-sm font-semibold hover:text-brand-600 transition-colors ${isDone ? 'text-gray-400 line-through' : 'text-gray-900'}`}
          >
            {task.title}
          </Link>
          <Badge variant="outline" className={`shrink-0 text-[10px] ${getPriorityColor(band)}`}>
            {getPriorityLabel(band)}
          </Badge>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            task.status === 'completed' ? 'bg-success-100 text-success' :
            task.status === 'confirmed' ? 'bg-brand-100 text-brand-700' :
            // pending = "AI Suggestions" — uses ai-100 (not 50) so the chip's
            // lightness matches Active's brand-100 chip side-by-side. Same
            // weight, distinct hue.
            'bg-ai-100 text-ai-700'
          }`}>
            {getTaskStatusLabel(task.status)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-500">{task.summary}</p>
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-gray-400">
          {matter ? (
            <span className="truncate text-gray-500">{matter.title}</span>
          ) : null}
          {scheduleLabel && (
            <span className={`flex items-center gap-1 ${isOverdue ? 'text-critical font-medium' : ''}`}>
              <Clock className="h-3 w-3" />
              {isOverdue ? 'Overdue: ' : ''}
              {scheduleLabel}
            </span>
          )}
          {senderName && (
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {senderName}
            </span>
          )}
          <span>Score: {task.priorityScore}</span>
        </div>
      </div>

      {/* Quick actions */}
      <div className={`flex items-center gap-1 ${isPending ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReassign(task) }}
          title="Change project"
          className="hidden group-hover:flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-500 hover:border-brand-300 hover:text-brand-600 transition-colors"
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </button>
        {isPending ? (
          <>
            <button
              className="flex items-center justify-center gap-1 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700 transition-colors min-w-[4.5rem]"
              onClick={() => { updateTask.mutate({ id: task.id, data: { status: 'confirmed' } }); toast.success('Task moved to Active') }}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              Activate
            </button>
            <button
              className="flex items-center gap-1 rounded-md border border-critical-100 px-2.5 py-1.5 text-xs font-medium text-critical hover:bg-critical-50 transition-colors"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(task.id) }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </>
        ) : task.status === 'confirmed' ? (
          <>
            <button
              className="flex items-center justify-center gap-1 rounded-md bg-success px-2.5 py-1.5 text-xs font-medium text-white hover:bg-success transition-colors min-w-[4.5rem]"
              onClick={() => {
                const prevStatus = task.status
                updateTask.mutate({ id: task.id, data: { status: 'completed' } })
                toast.success('Task completed', {
                  action: { label: 'Undo', onClick: () => updateTask.mutate({ id: task.id, data: { status: prevStatus } }) },
                })
              }}
            >
              <Check className="h-3.5 w-3.5" />
              Done
            </button>
            <button
              className="flex items-center gap-1 rounded-md border border-critical-100 px-2.5 py-1.5 text-xs font-medium text-critical hover:bg-critical-50 transition-colors"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(task.id) }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}

/* ========== CALENDAR VIEW ========== */
function TaskCalendarView({ tasks, updateTask }: { tasks: TaskItem[]; updateTask: MutationLike }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [pickerOpen, setPickerOpen] = useState(false)

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = currentMonth.getDay()

  // Previous month overflow days
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1))

  const todayStr = new Date().toDateString()

  // Group ALL tasks by date (not just current month)
  const tasksByDate = useMemo(() => {
    const map: Record<string, TaskItem[]> = {}
    for (const task of tasks) {
      const raw = task.userSetDeadline || task.explicitDeadline || task.inferredDeadline
      if (!raw) continue
      const d = new Date(raw)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (!map[key]) map[key] = []
      map[key].push(task)
    }

    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => {
        const aCompleted = a.status === 'completed'
        const bCompleted = b.status === 'completed'

        if (aCompleted !== bCompleted) {
          return aCompleted ? 1 : -1
        }

        return (b.priorityScore ?? 0) - (a.priorityScore ?? 0)
      })
    }

    return map
  }, [tasks])

  const handleDrop = useCallback((dayDate: Date) => {
    return (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const taskId = e.dataTransfer.getData('text/plain')
      if (taskId) {
        const y = dayDate.getFullYear()
        const m = String(dayDate.getMonth() + 1).padStart(2, '0')
        const d = String(dayDate.getDate()).padStart(2, '0')
        const dateStr = `${y}-${m}-${d}`
        const task = tasks.find((item) => item.id === taskId)
        const shouldAdjustStart = task?.startDate && new Date(task.startDate) > dayDate
        updateTask.mutate(
          { id: taskId, data: { userSetDeadline: dateStr, ...(shouldAdjustStart ? { startDate: dateStr } : {}) } },
          { onSuccess: () => toast.success('Deadline updated') }
        )
      }
    }
  }, [tasks, updateTask])

  // Build calendar cells with overflow days
  type CellData = { day: number; date: Date; isCurrentMonth: boolean }
  const cells: CellData[] = []

  // Previous month overflow
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i
    cells.push({ day, date: new Date(year, month - 1, day), isCurrentMonth: false })
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, date: new Date(year, month, d), isCurrentMonth: true })
  }
  // Next month overflow
  while (cells.length % 7 !== 0) {
    const day = cells.length - firstDayOfWeek - daysInMonth + 1
    cells.push({ day, date: new Date(year, month + 1, day), isCurrentMonth: false })
  }

  return (
    <Card>
      <CardContent className="py-4">
        <div className="mb-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger className="rounded-lg px-3 py-1.5 text-lg font-semibold text-gray-900 transition-colors hover:bg-brand-50 hover:text-brand-700">
              {currentMonth.toLocaleDateString('en', { month: 'long', year: 'numeric' })}
            </PopoverTrigger>
            <PopoverContent align="center" className="w-auto border-0 bg-transparent p-0 shadow-none">
              <MonthYearPanel
                value={currentMonth}
                onChange={(date) => {
                  setCurrentMonth(date)
                  setPickerOpen(false)
                }}
              />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="sm" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 border-b pb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-center text-xs font-medium text-gray-500">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((cell, idx) => {
            const key = `${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}`
            const dayTasks = tasksByDate[key] || []
            const isToday = cell.date.toDateString() === todayStr

            return (
              <div
                key={idx}
                className={`min-h-[100px] border-b border-r p-1 transition-colors ${
                  !cell.isCurrentMonth ? 'bg-gray-50/70' :
                  isToday ? 'bg-brand-50' : 'hover:bg-gray-50'
                }`}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                onDrop={handleDrop(cell.date)}
              >
                <div className={`mb-1 text-right text-xs ${
                  !cell.isCurrentMonth ? 'text-gray-300' :
                  isToday ? 'font-bold text-brand-700' : 'text-gray-400'
                }`}>
                  {cell.day}
                </div>
                <div className="space-y-1">
                  {dayTasks.map((task) => {
                    const band = getPriorityBand(task.priorityScore || 0)
                    const isCompleted = task.status === 'completed'
                    const bgColor = band === 'critical' ? 'bg-critical-50 border-critical-100 text-critical-700'
                      : band === 'high' ? 'bg-orange-50 border-orange-100 text-orange-700'
                      : band === 'medium' ? 'bg-yellow-50 border-yellow-100 text-yellow-700'
                      : 'bg-slate-100 border-slate-200 text-slate-600'
                    return (
                      <Link
                        key={task.id}
                        href={`/dashboard/tasks/${task.id}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', task.id)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        className={`block cursor-grab truncate rounded-md border px-1.5 py-1 text-[10px] font-semibold leading-tight shadow-sm active:cursor-grabbing ${bgColor} ${
                          isCompleted ? 'opacity-55 line-through saturate-[0.8]' : ''
                        } ${
                          !cell.isCurrentMonth ? 'opacity-50' : ''
                        }`}
                        title={`${task.title} — drag to reschedule`}
                      >
                        {task.title}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <p className="mt-3 text-[10px] text-gray-400">
          Drag tasks between dates to reschedule. Click a task to open details.
        </p>
      </CardContent>
    </Card>
  )
}
