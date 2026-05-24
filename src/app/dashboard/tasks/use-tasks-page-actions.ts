import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'
import type {
  CreateTaskResponse,
  QueryResponse,
  TaskDraft,
  TaskItem,
  TaskUpdateVars,
} from './task-page-types'
import { matchesPriorityFilter } from './task-page-types'

type SetState<T> = React.Dispatch<React.SetStateAction<T>>
type SetSelectedIds = (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => void
type BatchAction = 'complete' | 'activate' | 'delete'

type CreateTaskPayload = {
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
}

export function useTasksPageActions(input: {
  isPro: boolean
  extractText: string
  taskTitle: string
  taskSummary: string
  draftActionItems: string[]
  draftDeadline: string
  draftStartDate: string
  draftUrgency: number
  draftImpact: number
  draftPriorityScore: number
  draftSource: string
  selectedProjectId: string
  linkedEmailIds: string[]
  draftCards: TaskDraft[]
  selectedIds: Set<string>
  setShowUpgrade: SetState<boolean>
  setShowCreateModal: SetState<boolean>
  setShowPasteTextModal: SetState<boolean>
  setExtracting: SetState<boolean>
  setDraftActionItems: SetState<string[]>
  setDraftDeadline: SetState<string>
  setDraftStartDate: SetState<string>
  setSuggestingDates: SetState<boolean>
  setDraftUrgency: SetState<number>
  setDraftImpact: SetState<number>
  setDraftPriorityScore: SetState<number>
  setDraftSource: SetState<string>
  setTaskTitle: SetState<string>
  setTaskSummary: SetState<string>
  setDraftCards: SetState<TaskDraft[]>
  setSelectedIds: SetSelectedIds
  resetComposer: () => void
}) {
  const {
    isPro,
    extractText,
    taskTitle,
    taskSummary,
    draftActionItems,
    draftDeadline,
    draftStartDate,
    draftUrgency,
    draftImpact,
    draftPriorityScore,
    draftSource,
    selectedProjectId,
    linkedEmailIds,
    draftCards,
    selectedIds,
    setShowUpgrade,
    setShowCreateModal,
    setShowPasteTextModal,
    setExtracting,
    setDraftActionItems,
    setDraftDeadline,
    setDraftStartDate,
    setSuggestingDates,
    setDraftUrgency,
    setDraftImpact,
    setDraftPriorityScore,
    setDraftSource,
    setTaskTitle,
    setTaskSummary,
    setDraftCards,
    setSelectedIds,
    resetComposer,
  } = input

  const router = useRouter()
  const queryClient = useQueryClient()
  const [creatingTask, setCreatingTask] = useState(false)

  const invalidateTaskQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['tasks', 'tab-states'] })
    queryClient.invalidateQueries({ queryKey: ['stats'] })
  }

  const createOneTask = async (payload: CreateTaskPayload): Promise<CreateTaskResponse> => {
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

  const handleSuggestDates = async () => {
    if (!taskTitle.trim()) return
    if (!isPro) {
      setShowUpgrade(true)
      return
    }
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
      if (res.status === 402) {
        setShowUpgrade(true)
        return
      }
      if (!res.ok) {
        showError('Failed to suggest dates')
        return
      }
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
      if (draftCards.some((card) => !card.title.trim())) {
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

      const succeededCount = results.filter((result) => result.status === 'fulfilled').length
      const failedCards = draftCards.filter((_, index) => results[index].status === 'rejected')

      invalidateTaskQueries()

      if (failedCards.length === 0) {
        toast.success(`${succeededCount} task${succeededCount === 1 ? '' : 's'} created`)
        setShowPasteTextModal(false)
        resetComposer()
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
      queryClient.invalidateQueries({ queryKey: ['tasks', 'tab-states'] })
      toast.success('Task created')
      setShowCreateModal(false)
      resetComposer()
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
      }).then((res) => res.json()),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const previousTasks = queryClient.getQueriesData<QueryResponse<TaskItem[]>>({ queryKey: ['tasks'] })
      previousTasks.forEach(([queryKey, cached]) => {
        if (!cached?.data) return
        const scopeOrStatus = Array.isArray(queryKey) ? queryKey[1] : undefined
        const priority = Array.isArray(queryKey) ? queryKey[3] : undefined
        const nextData = cached.data
          .map((task) => (task.id === id ? { ...task, ...(data as Partial<TaskItem>) } : task))
          .filter((task) => {
            if (!matchesPriorityFilter(task, priority)) return false
            if (scopeOrStatus === 'open') return task.status === 'ai_suggestion' || task.status === 'active'
            if (scopeOrStatus === 'completed') return task.status === 'completed'
            if (scopeOrStatus === 'ai_suggestion') return task.status === 'ai_suggestion'
            if (scopeOrStatus === 'active') return task.status === 'active'
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
      invalidateTaskQueries()
    },
  })

  const handleDeleteTask = async (taskId: string) => {
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
    invalidateTaskQueries()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(taskId)
      return next
    })
    toast.success('Task deleted')
  }

  const batchOp = async (action: BatchAction) => {
    const ids = [...selectedIds]
    await fetch('/api/tasks/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action }),
    })
    invalidateTaskQueries()
    setSelectedIds(new Set())
    const label = action === 'complete' ? 'completed' : action === 'activate' ? 'activated' : 'deleted'
    toast.success(`${ids.length} task${ids.length === 1 ? '' : 's'} ${label}`)
  }

  return {
    creatingTask,
    handleGenerateTask,
    updateCard,
    removeCard,
    handleSuggestDates,
    handleCreateTask,
    updateTask,
    handleDeleteTask,
    batchOp,
  }
}
