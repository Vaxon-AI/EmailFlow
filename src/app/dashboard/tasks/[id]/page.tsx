'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/page-header'
import { StatePanel } from '@/components/state-panel'
import { InlineNotice } from '@/components/inline-notice'
import { ReassignProjectModal } from '@/components/reassign-project-modal'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select'
import {
  ArrowLeft, Mail, Calendar, TrendingUp, ExternalLink,
  CheckCircle2, ListChecks, FileText, Sparkles, ThumbsUp,
  X, AlertTriangle, Shield, RotateCcw, Square, CheckSquare, Plus,
  UserRound, ChevronRight, FolderOpen, Pencil, Check, Trash2,
} from 'lucide-react'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { getPriorityBand, getPriorityColor, getPriorityLabel } from '@/types'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'
import Link from 'next/link'
import { CACHE_TIME } from '@/lib/query-cache'

import {
  areAllChildrenCompleted,
  deleteItemWithChildren,
  generateChecklistItemId,
  getDirectChildren,
  hasChildren,
  parseActionItems,
  stripChecklistCompletion,
  type ChecklistItem,
} from './checklist-utils'

type TaskUpdatePayload = {
  title?: string
  summary?: string
  startDate?: string | null
  userSetDeadline?: string | null
  urgency?: number
  impact?: number
  userNotes?: string
  status?: string
  actionItems?: string
  checkedActionItems?: string
}

type TaskDetailResponse = {
  data?: Record<string, unknown>
}

type TaskEmailLink = {
  id: string
  email: {
    id: string
    subject: string
    sender?: string | null
    receivedAt: string
    threadId?: string | null
  }
}

type RecentEmail = {
  id: string
  subject: string
  sender: string
  receivedAt: string
  project: { id: string; name: string } | null
}

function toDateInputValue(value?: string | null) {
  return value ? value.toString().split('T')[0] : ''
}

function getDueDateValue(task: { userSetDeadline?: string | null; explicitDeadline?: string | null; inferredDeadline?: string | null }) {
  return task.userSetDeadline || task.explicitDeadline || task.inferredDeadline || ''
}

function getScheduleDuration(startDate: string, dueDate: string) {
  if (!startDate || !dueDate) return null
  const start = new Date(startDate)
  const due = new Date(dueDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(due.getTime())) return null
  const days = Math.max(1, Math.round((due.getTime() - start.getTime()) / 86400000) + 1)
  return `${days} day${days === 1 ? '' : 's'}`
}

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  ai_suggestion: { label: 'AI suggestion', color: 'bg-ai-50 text-ai-700 border-ai-100', bg: 'from-ai-50/50 to-white', icon: AlertTriangle },
  active: { label: 'Active', color: 'bg-brand-50 text-brand-700 border-brand-200', bg: 'from-brand-50/50 to-white', icon: ThumbsUp },
  completed: { label: 'Completed', color: 'bg-success-50 text-success border-success-100', bg: 'from-green-50/50 to-white', icon: CheckCircle2 },
}

export default function TaskDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const taskId = params.id as string

  const { data: res, isLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => fetch(`/api/tasks/${taskId}`).then((r) => r.json()),
    staleTime: CACHE_TIME.detail,
    placeholderData: (previous) => previous,
  })

  const task = res?.data

  const [editTitle, setEditTitle] = useState('')
  const [editSummary, setEditSummary] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editDeadline, setEditDeadline] = useState('')
  const [editUrgency, setEditUrgency] = useState(3)
  const [editImpact, setEditImpact] = useState(3)
  const [editNotes, setEditNotes] = useState('')
  const [editStatus, setEditStatus] = useState('ai_suggestion')
  const [actionCooldown, setActionCooldown] = useState(false)
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([])
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [unlinkingEmailId, setUnlinkingEmailId] = useState<string | null>(null)
  const [linkingEmailId, setLinkingEmailId] = useState<string | null>(null)
  const [emailPickerOpen, setEmailPickerOpen] = useState(false)
  const [emailPickerQuery, setEmailPickerQuery] = useState('')
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [editingField, setEditingField] = useState<string | null>(null)
  const [showReassign, setShowReassign] = useState(false)
  const [showChecklistCompleteDialog, setShowChecklistCompleteDialog] = useState(false)
  const waitingItemIdRef = useRef<string | null>(null)

  const goBack = useCallback(() => {
    if (window.history.length > 1) {
      router.back()
      return
    }
    router.push('/dashboard/tasks')
  }, [router])

  const emailLinks = useMemo(
    () => ((task?.emailLinks as TaskEmailLink[] | undefined) ?? []),
    [task?.emailLinks]
  )
  const linkedEmailIdSet = useMemo(
    () => new Set(emailLinks.map((link) => link.email.id)),
    [emailLinks]
  )

  const { data: recentEmailsRes } = useQuery({
    queryKey: ['recent-emails-for-task-link', taskId],
    queryFn: () => fetch('/api/emails?page=1&limit=50').then((r) => r.json()),
    staleTime: CACHE_TIME.list,
    enabled: Boolean(task),
  })
  const recentEmails = useMemo<RecentEmail[]>(
    () => recentEmailsRes?.data ?? [],
    [recentEmailsRes]
  )
  const filteredRecentEmails = useMemo(() => {
    const q = emailPickerQuery.trim().toLowerCase()
    return recentEmails.filter((email) => {
      if (linkedEmailIdSet.has(email.id)) return false
      if (!q) return true
      return email.subject?.toLowerCase().includes(q) || email.sender?.toLowerCase().includes(q)
    })
  }, [emailPickerQuery, linkedEmailIdSet, recentEmails])

  useEffect(() => {
    if (task) {
      setEditTitle(task.title)
      setEditSummary(task.summary)
      setEditStartDate(toDateInputValue(task.startDate))
      setEditDeadline(toDateInputValue(getDueDateValue(task)))
      setEditUrgency(task.urgency || 3)
      setEditImpact(task.impact || 3)
      setEditNotes(task.userNotes || '')
      setEditStatus(task.status || 'ai_suggestion')

      // Parse checklist items and mark completed ones
      const items = parseActionItems(task.actionItems)
      try {
        const checked = JSON.parse(task.checkedActionItems || '[]')
        const checkedSet = new Set(Array.isArray(checked) ? checked : [])
        const itemsWithStatus = items.map(item => ({
          ...item,
          completed: checkedSet.has(item.id)
        }))
        setChecklistItems(itemsWithStatus)

        // Expand all items that have children by default
        const expandedByDefault = new Set<string>()
        itemsWithStatus.forEach((item) => {
          if (hasChildren(itemsWithStatus, item.id)) {
            expandedByDefault.add(item.id)
          }
        })
        setExpandedItems(expandedByDefault)
      } catch {
        setChecklistItems(items)
      }
    }
  }, [task])

  const patchTaskCache = (patch: Record<string, unknown>) => {
    queryClient.setQueryData<TaskDetailResponse>(['task', taskId], (old) => {
      if (!old?.data) return old
      return { ...old, data: { ...old.data, ...patch } }
    })
  }

  const updateTask = useMutation({
    mutationFn: (data: TaskUpdatePayload) =>
      fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ['task', taskId] })
      const previousTask = queryClient.getQueryData<TaskDetailResponse>(['task', taskId])
      patchTaskCache(data as Record<string, unknown>)
      return { previousTask }
    },
    onError: (_err, _data, context) => {
      if (context?.previousTask) queryClient.setQueryData(['task', taskId], context.previousTask)
      showError('Failed to update task')
    },
    onSuccess: (_result, data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      if (data.status !== undefined) queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
  })

  const handleSave = () => {
    const nextStartDate = editStartDate && editDeadline && new Date(editStartDate) > new Date(editDeadline)
      ? editDeadline
      : editStartDate
    updateTask.mutate(
      {
        title: editTitle,
        summary: editSummary,
        startDate: nextStartDate || null,
        userSetDeadline: editDeadline || null,
        urgency: editUrgency,
        impact: editImpact,
        userNotes: editNotes,
        status: editStatus,
      },
      {
        onSuccess: () => {
          setEditStartDate(nextStartDate)
          toast.success('Changes saved')
        },
      }
    )
  }

  const handleStatusChange = (newStatus: string) => {
    setEditStatus(newStatus)
    setActionCooldown(true)
    setTimeout(() => setActionCooldown(false), 1500)
    updateTask.mutate(
      { status: newStatus },
      {
        onSuccess: () => {
          const label = statusConfig[newStatus]?.label || newStatus
          toast.success(`Status changed to ${label}`)
        },
      }
    )
  }

  const handleDeleteTask = async () => {
    setActionCooldown(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
      if (!res.ok) {
        showError('Failed to delete task')
        setActionCooldown(false)
        return
      }
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      toast.success('Task deleted')
      router.push('/dashboard/tasks')
    } catch {
      showError('Failed to delete task')
      setActionCooldown(false)
    }
  }

  const autoSaveChecklist = (items: ChecklistItem[]) => {
    const checkedIds = items.filter(item => item.completed).map(item => item.id)
    const actionItems = JSON.stringify(stripChecklistCompletion(items))
    const checkedActionItems = JSON.stringify(checkedIds)
    updateTask.mutate({
      actionItems,
      checkedActionItems
    })
  }

  const toggleCheckItem = (id: string) => {
    let next = checklistItems.map(item =>
      item.id === id ? { ...item, completed: !item.completed } : item
    )

    // Auto-complete parent: if all children are done, mark the parent complete too
    const item = next.find(i => i.id === id)
    if (item?.completed) {
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].level < item.level) {
          const parent = next[i]
          if (!parent.completed && areAllChildrenCompleted(next, parent.id)) {
            next = next.map(it => it.id === parent.id ? { ...it, completed: true } : it)
          }
        }
      }

      // If the item just checked is the "waiting for reply" entry, complete the task immediately
      if (waitingItemIdRef.current && id === waitingItemIdRef.current) {
        waitingItemIdRef.current = null
        setChecklistItems(next)
        autoSaveChecklist(next)
        handleStatusChange('completed')
        return
      }
    }

    setChecklistItems(next)
    autoSaveChecklist(next)

    // All items done and task not yet complete → show completion confirmation dialog
    const allDone = next.length > 0 && next.every(i => i.completed)
    const taskNotDone = editStatus !== 'completed'
    if (allDone && taskNotDone) {
      setShowChecklistCompleteDialog(true)
    }
  }

  const updateItemText = (id: string, text: string) => {
    const next = checklistItems.map(item =>
      item.id === id ? { ...item, text } : item
    )
    setChecklistItems(next)
    autoSaveChecklist(next)
  }

  const deleteItem = (id: string) => {
    const next = deleteItemWithChildren(checklistItems, id)
    setChecklistItems(next)
    autoSaveChecklist(next)

    // Clean up expandedItems when deleting an item and its children
    const deletedIds = new Set<string>()
    const itemIndex = checklistItems.findIndex(i => i.id === id)
    if (itemIndex >= 0) {
      const item = checklistItems[itemIndex]
      deletedIds.add(id)
      // Find all children that will be deleted
      for (let i = itemIndex + 1; i < checklistItems.length; i++) {
        if (checklistItems[i].level <= item.level) break
        deletedIds.add(checklistItems[i].id)
      }
    }

    // Remove deleted items from expandedItems
    if (deletedIds.size > 0) {
      const newExpandedItems = new Set(expandedItems)
      deletedIds.forEach(id => newExpandedItems.delete(id))
      setExpandedItems(newExpandedItems)
    }
  }

  const addItem = (parentId?: string) => {
    const parentItem = parentId ? checklistItems.find(i => i.id === parentId) : null
    const newLevel = parentItem ? parentItem.level + 1 : 0
    const parentIndex = parentItem ? checklistItems.indexOf(parentItem) : -1

    const newItem: ChecklistItem = {
      id: generateChecklistItemId(),
      text: '',
      level: newLevel,
      completed: false,
    }

    let next: ChecklistItem[]
    if (parentIndex >= 0) {
      // Insert after parent
      next = [...checklistItems]
      next.splice(parentIndex + 1, 0, newItem)
    } else {
      next = [...checklistItems, newItem]
    }
    setChecklistItems(next)
    autoSaveChecklist(next)
    setEditingItemId(newItem.id)
  }

  const outdentItem = (id: string) => {
    const next = checklistItems.map(item =>
      item.id === id && item.level > 0 ? { ...item, level: item.level - 1 } : item
    )
    setChecklistItems(next)
    autoSaveChecklist(next)
  }

  const indentItem = (id: string) => {
    const itemIndex = checklistItems.findIndex(i => i.id === id)
    if (itemIndex <= 0) return

    const prevItem = checklistItems[itemIndex - 1]

    // Can only become one level deeper than the previous item, max level 2
    const newLevel = prevItem.level + 1
    if (newLevel > 2) return

    const next = checklistItems.map((i, idx) =>
      idx === itemIndex ? { ...i, level: newLevel } : i
    )
    setChecklistItems(next)
    autoSaveChecklist(next)
  }

  const unlinkEmail = async (emailId: string) => {
    setUnlinkingEmailId(emailId)
    try {
      const res = await fetch(`/api/tasks/${taskId}/emails/${emailId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['task', taskId] })
        toast.success('Email unlinked')
      } else {
        showError('Failed to unlink email')
      }
    } catch {
      showError('Failed to unlink email')
    } finally {
      setUnlinkingEmailId(null)
    }
  }

  const linkEmail = async (emailId: string) => {
    setLinkingEmailId(emailId)
    try {
      const res = await fetch(`/api/tasks/${taskId}/emails/${emailId}`, {
        method: 'POST',
      })
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['task', taskId] })
        queryClient.invalidateQueries({ queryKey: ['tasks'] })
        setEmailPickerOpen(false)
        setEmailPickerQuery('')
        toast.success('Email linked')
      } else {
        showError('Failed to link email')
      }
    } catch {
      showError('Failed to link email')
    } finally {
      setLinkingEmailId(null)
    }
  }

  if (isLoading) {
    return (
      <StatePanel
        loading
        title="Loading task"
        description="Pulling the latest task details, checklist state, and linked emails."
      />
    )
  }

  if (!task) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={goBack} className="w-fit gap-2 px-0 text-gray-500 hover:bg-transparent hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" />
          Back to tasks
        </Button>
        <PageHeader
          title="Task unavailable"
          description="We couldn't find this task in the current workspace."
        />
        <StatePanel
          icon={<ListChecks className="h-5 w-5 text-gray-400" />}
          title="Task not found"
          description="It may have been removed or is no longer visible from this account."
        />
      </div>
    )
  }

  const band = getPriorityBand(task.priorityScore || 0)
  const deadline = getDueDateValue(task)
  const startDate = task.startDate || ''
  const scheduleDuration = getScheduleDuration(startDate, deadline)
  const sts = statusConfig[task.status] || statusConfig.ai_suggestion
  const StsIcon = sts.icon
  const project = task.project ?? null
  const matter = task.matter ?? null
  const threadId = emailLinks[0]?.email?.threadId ?? null
  const hasAiAnalysis = Boolean(
    task.priorityReason && (task.source === 'ai_auto' || task.source === 'copy_text')
  )

  return (
    <div className="animate-in fade-in duration-200">
      <Button variant="ghost" onClick={goBack} className="w-fit gap-2 px-0 text-gray-500 hover:bg-transparent hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" />
        Back to tasks
      </Button>
      <div className="mx-auto max-w-6xl space-y-5">
        <PageHeader
          title={task.title}
          description="Review task details, refine AI output, and keep linked source emails in sync."
          meta={`Created ${new Date(task.createdAt).toLocaleDateString('en', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })} · ${emailLinks.length} linked email${emailLinks.length === 1 ? '' : 's'}`}
        />

        <button
          onClick={() => setShowReassign(true)}
          className="group animate-fade-in-up stagger-2 flex w-full items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-2.5 text-left transition-colors hover:border-brand-200 hover:bg-brand-50/50"
          title="Click to change project"
        >
          <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="text-xs font-medium text-slate-500">{project?.identity?.name || 'Unassigned'}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="text-xs font-semibold text-slate-700">{project?.name || 'Uncategorized'}</span>
          {matter && (
            <>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
              <span className="text-xs text-slate-500">{matter.title}</span>
            </>
          )}
          <span className="ml-auto flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-500 shadow-sm group-hover:border-brand-300 group-hover:text-brand-600">
            <Pencil className="h-3 w-3" />
            Change
          </span>
        </button>

        <ReassignProjectModal
          open={showReassign}
          onOpenChange={setShowReassign}
          threadId={threadId ?? undefined}
          taskId={!threadId ? taskId : undefined}
          currentProject={project}
          invalidateKeys={[['task', taskId]]}
        />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left: Task content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header card */}
          <Card className={`animate-fade-in-up stagger-3 overflow-hidden border-white/70 bg-gradient-to-br ${sts.bg} shadow-sm`}>
            <CardContent className="py-5 space-y-4">
              {/* Meta badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={`gap-1 ${sts.color}`}>
                  <StsIcon className="h-3 w-3" />
                  {sts.label}
                </Badge>
                {task.archivedAt && (
                  <Badge variant="outline" className="gap-1 bg-gray-100 text-gray-600 border-gray-200">
                    Archived
                  </Badge>
                )}
                <Badge variant="outline" className={`gap-1 ${getPriorityColor(band)}`}>
                  <TrendingUp className="h-3 w-3" />
                  {getPriorityLabel(band)} — {task.priorityScore}
                </Badge>
                {deadline && (
                  <Badge variant="outline" className="gap-1 bg-white/60 text-gray-600 border-gray-200 text-[10px]">
                    <Calendar className="h-3 w-3" />
                    Due {new Date(deadline).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Badge>
                )}
              </div>
              {task.archivedAt ? (
                <InlineNotice variant="info">
                  <span className="text-xs">
                    This task was auto-archived on {new Date(task.archivedAt as string).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}.
                    It stays accessible from the linked email until the source emails are also fully removed.
                  </span>
                </InlineNotice>
              ) : null}

              {/* Quick actions for pending */}
              {task.status === 'ai_suggestion' && (
                <InlineNotice variant="warning">
                  <div className="flex w-full items-center gap-3">
                    <span className="min-w-0 flex-1 text-left">This AI suggestion is waiting for you before it becomes active work.</span>
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      <Button size="sm" variant="brandSoft" className="h-8 gap-1.5" onClick={() => handleStatusChange('active')}>
                        <ThumbsUp className="h-3.5 w-3.5" />
                        Activate
                      </Button>
                      <Button size="sm" variant="destructive" className="h-8 gap-1.5" onClick={handleDeleteTask}>
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </InlineNotice>
              )}


              {/* Quick actions for completed */}
              {task.status === 'completed' && (
                <InlineNotice variant="success">
                  <div className="flex w-full items-center gap-3">
                    <span className="min-w-0 flex-1 text-left">This task is marked complete. Reopen it if more work shows up.</span>
                    <Button size="sm" variant="success" className="ml-auto h-8 shrink-0 gap-1.5" onClick={() => handleStatusChange('active')}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reopen
                    </Button>
                  </div>
                </InlineNotice>
              )}
              {/* Summary */}
              <div className="rounded-xl bg-white/70 backdrop-blur-sm border px-4 py-3">
                <p className="text-sm text-gray-700 leading-relaxed">{task.summary}</p>
                <p className="text-[11px] text-gray-400 mt-2">
                  Created {new Date(task.createdAt).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Task Info */}
          <Card className={`animate-fade-in-up stagger-3 border-white/70 bg-gradient-to-br ${sts.bg} shadow-sm`}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="h-4 w-4" />
                Task Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="cursor-text group">
                <Label className="text-xs text-gray-500">Title</Label>
                {editingField === 'title' ? (
                  <Input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => { handleSave(); setEditingField(null) }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { handleSave(); setEditingField(null) }
                      if (e.key === 'Escape') { setEditTitle(task.title); setEditingField(null) }
                    }}
                    className="mt-1"
                  />
                ) : (
                  <p
                    onClick={() => setEditingField('title')}
                    className="mt-1 text-sm font-semibold text-gray-900 py-2 px-2 -mx-2 rounded group-hover:bg-gray-50 transition-colors"
                  >
                    {task.title}
                  </p>
                )}
              </div>

              <div className="cursor-text group">
                <Label className="text-xs text-gray-500">Summary</Label>
                {editingField === 'summary' ? (
                  <Textarea
                    autoFocus
                    value={editSummary}
                    onChange={(e) => setEditSummary(e.target.value)}
                    onBlur={() => { handleSave(); setEditingField(null) }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleSave(); setEditingField(null) }
                      if (e.key === 'Escape') { setEditSummary(task.summary); setEditingField(null) }
                    }}
                    rows={3}
                    className="mt-1"
                  />
                ) : (
                  <p
                    onClick={() => setEditingField('summary')}
                    className="mt-1 text-sm text-gray-700 leading-relaxed py-2 px-2 -mx-2 rounded group-hover:bg-gray-50 transition-colors"
                  >
                    {task.summary || '—'}
                  </p>
                )}
              </div>

              <div className="cursor-text group">
                <Label className="text-xs text-gray-500">Schedule</Label>
                {editingField === 'schedule' ? (
                  <div className="mt-1 grid grid-cols-2 gap-2" data-schedule-edit="">
                    <div>
                      <Label className="text-[11px] text-gray-400">Start date</Label>
                      <Input
                        autoFocus
                        type="date"
                        value={editStartDate}
                        onChange={(e) => setEditStartDate(e.target.value)}
                        onBlur={(e) => {
                          if ((e.relatedTarget as Element | null)?.closest('[data-schedule-edit]')) return
                          handleSave(); setEditingField(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { handleSave(); setEditingField(null) }
                          if (e.key === 'Escape') {
                            setEditStartDate(toDateInputValue(task.startDate))
                            setEditDeadline(toDateInputValue(getDueDateValue(task)))
                            setEditingField(null)
                          }
                        }}
                        className="mt-1 h-9 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-gray-400">Due date</Label>
                      <Input
                        type="date"
                        value={editDeadline}
                        onChange={(e) => setEditDeadline(e.target.value)}
                        onBlur={(e) => {
                          if ((e.relatedTarget as Element | null)?.closest('[data-schedule-edit]')) return
                          handleSave(); setEditingField(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { handleSave(); setEditingField(null) }
                          if (e.key === 'Escape') {
                            setEditStartDate(toDateInputValue(task.startDate))
                            setEditDeadline(toDateInputValue(getDueDateValue(task)))
                            setEditingField(null)
                          }
                        }}
                        className="mt-1 h-9 text-sm"
                      />
                    </div>
                  </div>
                ) : (
                  <p
                    onClick={() => setEditingField('schedule')}
                    className="mt-1 flex items-center gap-1.5 py-2 px-2 -mx-2 rounded text-sm text-gray-700 group-hover:bg-gray-50 transition-colors"
                  >
                    {startDate && deadline ? (
                      <>
                        <span>{new Date(startDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
                        <span className="text-gray-400">→</span>
                        <span>{new Date(deadline).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
                        {scheduleDuration && <span className="ml-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">{scheduleDuration}</span>}
                      </>
                    ) : deadline ? (
                      <span>Due {new Date(deadline).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
                    ) : startDate ? (
                      <span>From {new Date(startDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
                    ) : (
                      <span className="font-medium">—</span>
                    )}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="cursor-text group">
                  <Label className="text-xs text-gray-500">Urgency</Label>
                  {editingField === 'urgency' ? (
                    <Input
                      autoFocus
                      type="number"
                      min={1}
                      max={5}
                      value={editUrgency}
                      onChange={(e) => setEditUrgency(Number(e.target.value))}
                      onBlur={() => { handleSave(); setEditingField(null) }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { handleSave(); setEditingField(null) }
                        if (e.key === 'Escape') { setEditUrgency(task.urgency || 3); setEditingField(null) }
                      }}
                      className="mt-1"
                    />
                  ) : (
                    <p
                      onClick={() => setEditingField('urgency')}
                      className="mt-1 text-sm font-medium text-gray-700 py-2 px-2 -mx-2 rounded group-hover:bg-gray-50 transition-colors"
                    >
                      {task.urgency || '—'} / 5
                    </p>
                  )}
                </div>
                <div className="cursor-text group">
                  <Label className="text-xs text-gray-500">Impact</Label>
                  {editingField === 'impact' ? (
                    <Input
                      autoFocus
                      type="number"
                      min={1}
                      max={5}
                      value={editImpact}
                      onChange={(e) => setEditImpact(Number(e.target.value))}
                      onBlur={() => { handleSave(); setEditingField(null) }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { handleSave(); setEditingField(null) }
                        if (e.key === 'Escape') { setEditImpact(task.impact || 3); setEditingField(null) }
                      }}
                      className="mt-1"
                    />
                  ) : (
                    <p
                      onClick={() => setEditingField('impact')}
                      className="mt-1 text-sm font-medium text-gray-700 py-2 px-2 -mx-2 rounded group-hover:bg-gray-50 transition-colors"
                    >
                      {task.impact || '—'} / 5
                    </p>
                  )}
                </div>
              </div>

              <div className="cursor-text group">
                <Label className="text-xs text-gray-500">Your Notes</Label>
                {editingField === 'notes' ? (
                  <Textarea
                    autoFocus
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    onBlur={() => { handleSave(); setEditingField(null) }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); handleSave(); setEditingField(null) }
                      if (e.key === 'Escape') { setEditNotes(task.userNotes || ''); setEditingField(null) }
                    }}
                    rows={2}
                    placeholder="Add personal notes..."
                    className="mt-1"
                  />
                ) : (
                  <p
                    onClick={() => setEditingField('notes')}
                    className="mt-1 text-sm text-gray-700 py-2 px-2 -mx-2 rounded group-hover:bg-gray-50 transition-colors"
                  >
                    {task.userNotes || '—'}
                  </p>
                )}
              </div>

              <div>
                <Label className="text-xs text-gray-500">Status</Label>
                <Select
                  value={editStatus}
                  onValueChange={(value) => { if (value) handleStatusChange(value) }}
                  disabled={updateTask.isPending || actionCooldown}
                >
                  <SelectTrigger className="mt-1.5 h-8 w-48 border-gray-200 bg-white text-sm shadow-sm">
                    {(() => {
                      const cfg = statusConfig[editStatus]
                      const Icon = cfg?.icon ?? AlertTriangle
                      const iconColor: Record<string, string> = {
                        ai_suggestion: 'text-ai',
                        active: 'text-brand-500',
                        completed: 'text-success',
                      }
                      return (
                        <div className="flex items-center gap-1.5">
                          <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor[editStatus] ?? 'text-gray-400'}`} />
                          <span className="text-gray-700">{cfg?.label ?? editStatus}</span>
                        </div>
                      )
                    })()}
                  </SelectTrigger>
                  <SelectContent align="start">
                    {Object.entries(statusConfig)
                      .map(([value, opt]) => {
                        const Icon = opt.icon
                        const iconColor: Record<string, string> = {
                          ai_suggestion: 'text-ai',
                          active: 'text-brand-500',
                          completed: 'text-success',
                        }
                        return (
                          <SelectItem key={value} value={value}>
                            <div className="flex items-center gap-1.5">
                              <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor[value] ?? 'text-gray-400'}`} />
                              {opt.label}
                            </div>
                          </SelectItem>
                        )
                      })}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* AI Analysis */}
          {hasAiAnalysis && (
            <Card className="animate-fade-in-up stagger-4 border-warning-100 bg-gradient-to-br from-yellow-50/50 to-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-warning" />
                  AI Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-yellow-800 leading-relaxed">{task.priorityReason}</p>
              </CardContent>
            </Card>
          )}

          {/* Checklist — fully editable */}
          <Card className="animate-fade-in-up stagger-5 border-white/70 bg-white/95 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <ListChecks className="h-4 w-4 text-brand-500" />
                    Checklist
                    <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">
                      {checklistItems.filter(i => i.completed).length}/{checklistItems.length}
                    </span>
                  </CardTitle>
                  <button
                    onClick={() => addItem()}
                    className="shrink-0 p-1 rounded-full hover:bg-brand-100 transition-colors text-brand-600 hover:text-brand-700"
                    title="Add item"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 px-3 pt-3">
                {checklistItems.length === 0 && (
                  <button
                    type="button"
                    onClick={() => addItem()}
                    className="flex w-full items-center gap-2 rounded-lg border border-dashed border-brand-200 bg-brand-50/40 px-3 py-3 text-left text-xs text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Add the first checklist item</span>
                  </button>
                )}

                {/* Progress bar */}
                {checklistItems.length > 1 && (
                  <div className="mb-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all duration-300"
                      style={{ width: `${(checklistItems.filter(i => i.completed).length / checklistItems.length) * 100}%` }}
                    />
                  </div>
                )}

                {/* Item list */}
                <ul className="-ml-2 space-y-1.5">
                  {checklistItems.map((item, idx) => {
                    const isEditing = editingItemId === item.id
                    const isExpanded = expandedItems.has(item.id)
                    const itemHasChildren = hasChildren(checklistItems, item.id)
                    const childrenCount = getDirectChildren(checklistItems, item.id).length

                    // Determine visibility: show if top-level or all ancestors are expanded
                    const shouldShow = (() => {
                      if (item.level === 0) return true
                      // Walk up to find all parent items and check they are expanded
                      for (let i = idx - 1; i >= 0; i--) {
                        const ancestor = checklistItems[i]
                        if (ancestor.level < item.level) {
                          // Found a parent
                          if (ancestor.level === item.level - 1) {
                            return expandedItems.has(ancestor.id)
                          }
                          // Keep looking upward
                        } else if (ancestor.level === 0) {
                          // Reached the top without finding the direct parent
                          return false
                        }
                      }
                      return false
                    })()

                    if (!shouldShow) return null

                    return (
                      <li
                        key={item.id}
                        className="group relative flex items-center gap-2 rounded-lg transition-all hover:bg-gray-50"
                        style={{ paddingLeft: `${item.level * 8}px` }}
                      >
                        {/* Expand/Collapse button */}
                        {itemHasChildren && !isEditing ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              const next = new Set(expandedItems)
                              if (next.has(item.id)) {
                                next.delete(item.id)
                              } else {
                                next.add(item.id)
                              }
                              setExpandedItems(next)
                            }}
                            className="shrink-0 p-1 hover:bg-gray-100 rounded transition-colors text-gray-400 hover:text-gray-600"
                            title={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            <svg
                              className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </button>
                        ) : (
                          <div className="shrink-0 w-0.5" />
                        )}

                        {/* Checkbox */}
                        <button
                          onClick={() => toggleCheckItem(item.id)}
                          className="shrink-0 rounded p-1 hover:bg-gray-100 transition-colors"
                        >
                          {item.completed ? (
                            <CheckSquare className="h-4 w-4 text-brand-500" />
                          ) : (
                            <Square className="h-4 w-4 text-gray-300 group-hover:text-brand-400 transition-colors" />
                          )}
                        </button>

                        {/* Text / Input */}
                        <div className="flex-1 min-w-0">
                          {isEditing ? (
                            <input
                              autoFocus
                              type="text"
                              value={item.text}
                              onChange={(e) => updateItemText(item.id, e.target.value)}
                              onBlur={() => setEditingItemId(null)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  setEditingItemId(null)
                                }
                                if (e.key === 'Escape') setEditingItemId(null)
                                if (e.key === 'Tab') {
                                  e.preventDefault()
                                  if (e.shiftKey) {
                                    outdentItem(item.id)
                                  } else {
                                    indentItem(item.id)
                                  }
                                }
                              }}
                              className="w-full text-sm bg-brand-50 border border-brand-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-200"
                            />
                          ) : (
                            <span
                              onClick={() => setEditingItemId(item.id)}
                              className={`block text-sm cursor-text py-1.5 px-1 -mx-1 rounded transition-all ${
                                item.completed
                                  ? 'text-gray-400 line-through'
                                  : 'text-gray-700 hover:bg-gray-100'
                              }`}
                            >
                              {item.text || '(empty)'}
                              {itemHasChildren && <span className="text-xs text-gray-400 ml-1">({childrenCount})</span>}
                            </span>
                          )}
                        </div>

                        {/* Action buttons */}
                        {!isEditing && (
                        <div className="absolute -right-2 top-0 bottom-0 flex items-center gap-0 pr-4 pl-8 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-l from-white via-white via-80% to-transparent z-10">
                          {item.level > 0 && (
                            <button
                              onClick={() => outdentItem(item.id)}
                              className="p-1 hover:bg-gray-100 rounded transition-colors text-gray-400 hover:text-gray-600"
                              title="Outdent"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="15 18 9 12 15 6" />
                              </svg>
                            </button>
                          )}
                          {idx > 0 && item.level < 2 && checklistItems[idx - 1].level >= item.level && (
                            <button
                              onClick={() => indentItem(item.id)}
                              className="p-1 hover:bg-gray-100 rounded transition-colors text-gray-400 hover:text-gray-600"
                              title="Indent"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="9 18 15 12 9 6" />
                              </svg>
                            </button>
                          )}
                          {item.level < 2 && (
                            <button
                              onClick={() => addItem(item.id)}
                              className="p-1 hover:bg-gray-100 rounded transition-colors text-gray-400 hover:text-brand-600"
                              title="Add subtask"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => {
                              const childCount = getDirectChildren(checklistItems, item.id).length
                              if (childCount > 0) {
                                if (confirm(`Delete "${item.text}" and its ${childCount} subtask${childCount > 1 ? 's' : ''}?`)) {
                                  deleteItem(item.id)
                                }
                              } else {
                                deleteItem(item.id)
                              }
                            }}
                            className="p-1 hover:bg-critical-50 rounded transition-colors text-gray-400 hover:text-critical"
                            title={itemHasChildren ? 'Delete with subtasks' : 'Delete'}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>

          {/* Source Emails */}
          <Card className="animate-fade-in-up stagger-6 border-white/70 bg-white/95 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-brand-600" />
                    Source Emails
                    <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">{emailLinks.length}</span>
                  </CardTitle>
                  <Popover open={emailPickerOpen} onOpenChange={setEmailPickerOpen}>
                    <PopoverTrigger
                      render={
                        <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-xs">
                          <Plus className="h-3.5 w-3.5" />
                          Link
                        </Button>
                      }
                    />
                    <PopoverContent className="w-[360px] p-0" align="end">
                      <div className="space-y-2 border-b p-2">
                        <Input
                          placeholder="Search by subject or sender..."
                          value={emailPickerQuery}
                          onChange={(e) => setEmailPickerQuery(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="max-h-[260px] overflow-y-auto">
                        {filteredRecentEmails.length === 0 ? (
                          <div className="p-4 text-center text-xs text-muted-foreground">
                            {recentEmails.length === 0 ? 'No emails available' : 'No emails match your search'}
                          </div>
                        ) : (
                          filteredRecentEmails.map((email) => {
                            const isLinking = linkingEmailId === email.id
                            return (
                              <button
                                key={email.id}
                                type="button"
                                onClick={() => linkEmail(email.id)}
                                disabled={isLinking}
                                className="flex w-full items-start gap-2 border-b border-border/50 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50 disabled:opacity-50"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-medium">{email.subject || '(no subject)'}</div>
                                  <div className="truncate text-muted-foreground">{email.sender}</div>
                                </div>
                                {isLinking && <Check className="size-3.5 shrink-0 text-brand-600" />}
                              </button>
                            )
                          })
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {emailLinks.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-3 py-3 text-xs text-slate-500">
                    No source email linked.
                  </div>
                )}
                {emailLinks.map((link) => {
                  const senderName = link.email.sender?.split('<')[0]?.trim()
                  const senderInitial = (senderName || 'U')[0].toUpperCase()
                  const isUnlinking = unlinkingEmailId === link.email.id
                  return (
                    <div
                      key={link.id}
                      className="flex items-center gap-3 rounded-lg border p-3 transition-all hover:bg-brand-50/50 hover:border-brand-200 group"
                    >
                      <Link
                        href={`/dashboard/emails/${link.email.id}`}
                        className="flex items-center gap-3 flex-1 min-w-0"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white text-xs font-bold">
                          {senderInitial}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900 group-hover:text-brand-600 transition-colors">
                            {link.email.subject}
                          </p>
                          <p className="truncate text-xs text-gray-500">
                            {senderName} — {new Date(link.email.receivedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                          </p>
                        </div>
                        <ExternalLink className="h-4 w-4 text-gray-300 group-hover:text-brand-400 shrink-0 transition-colors" />
                      </Link>
                      <button
                        onClick={() => {
                          if (confirm('Remove this email from the task?')) {
                            unlinkEmail(link.email.id)
                          }
                        }}
                        disabled={isUnlinking}
                        className="shrink-0 p-1 rounded hover:bg-critical-50 transition-colors text-gray-300 hover:text-critical disabled:opacity-50"
                        title="Remove email"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

          {/* Task metadata */}
          <Card className="animate-fade-in-up stagger-7 border-white/70 bg-white/95 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-gray-400" />
                Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <dt className="text-gray-400">Status</dt>
                  <dd className="font-medium text-gray-700">{sts.label}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-400">Priority</dt>
                  <dd className="font-medium text-gray-700">{getPriorityLabel(band)} ({task.priorityScore})</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-400">Urgency</dt>
                  <dd className="font-medium text-gray-700">{task.urgency || '—'} / 5</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-400">Impact</dt>
                  <dd className="font-medium text-gray-700">{task.impact || '—'} / 5</dd>
                </div>
                {startDate && (
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Start</dt>
                    <dd className="font-medium text-gray-700">{new Date(startDate).toLocaleDateString()}</dd>
                  </div>
                )}
                {deadline && (
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Due</dt>
                    <dd className="font-medium text-gray-700">{new Date(deadline).toLocaleDateString()}</dd>
                  </div>
                )}
                {scheduleDuration && (
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Duration</dt>
                    <dd className="font-medium text-gray-700">{scheduleDuration}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-gray-400">Created</dt>
                  <dd className="font-medium text-gray-700">{new Date(task.createdAt).toLocaleDateString()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-400">Source emails</dt>
                  <dd className="font-medium text-gray-700">{task.emailLinks?.length || 0}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

        </div>
        </div>
      </div>

      <Dialog open={showChecklistCompleteDialog} onOpenChange={setShowChecklistCompleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>🎉 Checklist Complete!</DialogTitle>
            <DialogDescription>
              You&apos;ve checked off all items. Do you want to mark this task as complete?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowChecklistCompleteDialog(false)
                const waitingItem: ChecklistItem = {
                  id: generateChecklistItemId(),
                  text: 'Waiting for reply',
                  level: 0,
                  completed: false,
                }
                waitingItemIdRef.current = waitingItem.id
                const next = [...checklistItems, waitingItem]
                setChecklistItems(next)
                autoSaveChecklist(next)
                toast('Waiting for reply item added — check it off when ready.')
              }}
            >
              No, waiting for reply
            </Button>
            <Button
              onClick={() => {
                setShowChecklistCompleteDialog(false)
                handleStatusChange('completed')
              }}
            >
              Yes, mark complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
