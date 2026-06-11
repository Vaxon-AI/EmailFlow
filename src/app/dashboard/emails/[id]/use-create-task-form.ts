'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'

export function useCreateTaskForm({
  emailId,
  projectId,
  isPro,
}: {
  emailId: string
  projectId: string | undefined
  isPro: boolean
}) {
  const queryClient = useQueryClient()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskSummary, setTaskSummary] = useState('')
  const [linkedEmailIds, setLinkedEmailIds] = useState<string[]>([])
  const [creatingTask, setCreatingTask] = useState(false)
  const [draftDeadline, setDraftDeadline] = useState('')
  const [draftStartDate, setDraftStartDate] = useState('')
  const [suggestingDates, setSuggestingDates] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [draftUrgency, setDraftUrgency] = useState(3)
  const [draftImpact, setDraftImpact] = useState(3)
  const [draftPriorityScore, setDraftPriorityScore] = useState(9)
  const [draftActionItems, setDraftActionItems] = useState<string[]>([])

  const resetCreateForm = () => {
    setTaskTitle('')
    setTaskSummary('')
    setLinkedEmailIds([])
    setDraftDeadline('')
    setDraftStartDate('')
    setSuggestingDates(false)
    setDraftUrgency(3)
    setDraftImpact(3)
    setDraftPriorityScore(9)
    setDraftActionItems([])
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
          projectId: projectId || undefined,
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

  const handleCreateModalOpenChange = (open: boolean) => {
    setShowCreateModal(open)
    if (!open) resetCreateForm()
  }

  const handleCreateTask = async () => {
    setCreatingTask(true)
    try {
      const res = await fetch('/api/emails/create-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskTitle,
          summary: taskSummary,
          sourceEmailId: emailId,
          linkedEmailIds: linkedEmailIds.length > 0 ? linkedEmailIds : [emailId],
          urgency: draftUrgency,
          impact: draftImpact,
          priorityScore: draftPriorityScore,
          userSetDeadline: draftDeadline || undefined,
          startDate: draftStartDate || undefined,
          actionItems: draftActionItems.length > 0 ? draftActionItems : undefined,
          projectId: projectId || undefined,
        }),
      })

      if (res.ok) {
        await res.json()
        queryClient.invalidateQueries({ queryKey: ['email', emailId] })
        queryClient.invalidateQueries({ queryKey: ['tasks'] })
        queryClient.invalidateQueries({ queryKey: ['syncBatch'] })
        toast.success('Task created')
        setShowCreateModal(false)
        resetCreateForm()
      } else {
        showError('Failed to create task')
      }
    } catch {
      showError('Failed to create task')
    } finally {
      setCreatingTask(false)
    }
  }

  return {
    showCreateModal,
    setShowCreateModal,
    taskTitle,
    setTaskTitle,
    taskSummary,
    setTaskSummary,
    linkedEmailIds,
    setLinkedEmailIds,
    creatingTask,
    draftDeadline,
    setDraftDeadline,
    draftStartDate,
    setDraftStartDate,
    suggestingDates,
    showUpgrade,
    setShowUpgrade,
    draftUrgency,
    setDraftUrgency,
    draftImpact,
    setDraftImpact,
    draftPriorityScore,
    setDraftPriorityScore,
    draftActionItems,
    setDraftActionItems,
    handleSuggestDates,
    handleCreateModalOpenChange,
    handleCreateTask,
  }
}
