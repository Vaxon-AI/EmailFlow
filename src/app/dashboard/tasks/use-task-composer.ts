import { useState } from 'react'
import type { TaskDraft } from './task-page-types'

export function useTaskComposer() {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showPasteTextModal, setShowPasteTextModal] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskSummary, setTaskSummary] = useState('')
  const [extractText, setExtractText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [draftActionItems, setDraftActionItems] = useState<string[]>([])
  const [draftDeadline, setDraftDeadline] = useState('')
  const [draftStartDate, setDraftStartDate] = useState('')
  const [suggestingDates, setSuggestingDates] = useState(false)
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

  const resetComposer = () => {
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

  const handleCreateModalOpenChange = (open: boolean) => {
    setShowCreateModal(open)
    if (!open) resetComposer()
  }

  const handlePasteTextOpenChange = (open: boolean) => {
    setShowPasteTextModal(open)
    if (open) {
      setDraftSource('copy_text')
      return
    }
    resetComposer()
  }

  const openManualTaskModal = () => {
    setDraftSource('manual')
    setShowCreateModal(true)
  }

  return {
    showCreateModal,
    showPasteTextModal,
    taskTitle,
    taskSummary,
    extractText,
    extracting,
    draftActionItems,
    draftDeadline,
    draftStartDate,
    suggestingDates,
    draftUrgency,
    draftImpact,
    draftPriorityScore,
    draftSource,
    selectedIdentityId,
    selectedProjectId,
    linkedEmailIds,
    emailPickerOpen,
    emailPickerQuery,
    draftCards,
    setShowCreateModal,
    setShowPasteTextModal,
    setTaskTitle,
    setTaskSummary,
    setExtractText,
    setExtracting,
    setDraftActionItems,
    setDraftDeadline,
    setDraftStartDate,
    setSuggestingDates,
    setDraftUrgency,
    setDraftImpact,
    setDraftPriorityScore,
    setDraftSource,
    setSelectedIdentityId,
    setSelectedProjectId,
    setLinkedEmailIds,
    setEmailPickerOpen,
    setEmailPickerQuery,
    setDraftCards,
    resetComposer,
    handleCreateModalOpenChange,
    handlePasteTextOpenChange,
    openManualTaskModal,
  }
}
