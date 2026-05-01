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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/page-header'
import { StatePanel } from '@/components/state-panel'
import { InlineNotice } from '@/components/inline-notice'
import { ReassignProjectModal } from '@/components/reassign-project-modal'
import {
  ArrowLeft, Mail, Calendar, TrendingUp, ExternalLink,
  CheckCircle2, ListChecks, FileText, Sparkles, ThumbsUp,
  X, Check, AlertTriangle, Shield, RotateCcw, Square, CheckSquare, Plus,
  UserRound, ChevronRight, FolderOpen, Pencil,
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { getPriorityBand, getPriorityColor, getPriorityLabel } from '@/types'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'
import Link from 'next/link'
import { CACHE_TIME } from '@/lib/query-cache'

interface ChecklistItem {
  id: string
  text: string
  level: number
  completed: boolean
}

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

function parseActionItems(raw: unknown): ChecklistItem[] {
  if (!raw) return []

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw

    // New format: already structured as ChecklistItem[]
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && 'id' in parsed[0]) {
      return parsed
    }

    // Legacy format: simple string array — convert to ChecklistItem[]
    if (Array.isArray(parsed)) {
      return parsed.map((text, idx) => ({
        id: `item-${idx}`,
        text: String(text),
        level: 0,
        completed: false,
      }))
    }

    return []
  } catch {
    return []
  }
}

function generateId(): string {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function toDateInputValue(value?: string | null) {
  return value ? value.toString().split('T')[0] : ''
}

function getDueDateValue(task: { userSetDeadline?: string | null; explicitDeadline?: string | null; inferredDeadline?: string | null }) {
  return task.userSetDeadline || task.explicitDeadline || task.inferredDeadline || ''
}

function stripChecklistCompletion(items: ChecklistItem[]) {
  return items.map(({ id, text, level }) => ({ id, text, level }))
}

function getScheduleDuration(startDate: string, dueDate: string) {
  if (!startDate || !dueDate) return null
  const start = new Date(startDate)
  const due = new Date(dueDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(due.getTime())) return null
  const days = Math.max(1, Math.round((due.getTime() - start.getTime()) / 86400000) + 1)
  return `${days} day${days === 1 ? '' : 's'}`
}

// 获取某项的子任务（下一级）
function getDirectChildren(items: ChecklistItem[], parentId: string): ChecklistItem[] {
  const parentIndex = items.findIndex(i => i.id === parentId)
  if (parentIndex < 0) return []

  const parent = items[parentIndex]
  const children: ChecklistItem[] = []

  for (let i = parentIndex + 1; i < items.length; i++) {
    if (items[i].level === parent.level + 1) {
      children.push(items[i])
    } else if (items[i].level <= parent.level) {
      break
    }
  }

  return children
}

// 判断是否有子任务
function hasChildren(items: ChecklistItem[], itemId: string): boolean {
  const itemIndex = items.findIndex(i => i.id === itemId)
  if (itemIndex < 0 || itemIndex >= items.length - 1) return false

  const item = items[itemIndex]
  // 检查后续是否有子级（level > item.level，且是第一个这样的项）
  for (let i = itemIndex + 1; i < items.length; i++) {
    if (items[i].level > item.level) {
      return true
    } else if (items[i].level <= item.level) {
      return false
    }
  }
  return false
}

// 删除项目及其所有后代
function deleteItemWithChildren(items: ChecklistItem[], itemId: string): ChecklistItem[] {
  const itemIndex = items.findIndex(i => i.id === itemId)
  if (itemIndex < 0) return items

  const item = items[itemIndex]
  const result = [...items]
  let deleteCount = 1

  for (let i = itemIndex + 1; i < items.length; i++) {
    if (items[i].level <= item.level) break
    deleteCount++
  }

  result.splice(itemIndex, deleteCount)
  return result
}

// 检查所有子任务是否完成（递归）
function areAllChildrenCompleted(items: ChecklistItem[], itemId: string): boolean {
  const children = getDirectChildren(items, itemId)
  if (children.length === 0) return true

  return children.every(child => {
    if (!child.completed) return false
    return areAllChildrenCompleted(items, child.id)
  })
}

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  pending: { label: 'AI Suggestion', color: 'bg-purple-50 text-purple-700 border-purple-200', bg: 'from-purple-50/50 to-white', icon: AlertTriangle },
  confirmed: { label: 'Active', color: 'bg-blue-50 text-blue-700 border-blue-200', bg: 'from-blue-50/50 to-white', icon: ThumbsUp },
  completed: { label: 'Completed', color: 'bg-green-50 text-green-700 border-green-200', bg: 'from-green-50/50 to-white', icon: CheckCircle2 },
  dismissed: { label: 'Dismissed', color: 'bg-gray-50 text-gray-500 border-gray-200', bg: 'from-gray-50/50 to-white', icon: X },
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
  const [editStatus, setEditStatus] = useState('pending')
  const [actionCooldown, setActionCooldown] = useState(false)
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([])
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [unlinkingEmailId, setUnlinkingEmailId] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [editingField, setEditingField] = useState<string | null>(null)
  const [showReassign, setShowReassign] = useState(false)
  const [showChecklistCompleteDialog, setShowChecklistCompleteDialog] = useState(false)
  const waitingItemIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (task) {
      setEditTitle(task.title)
      setEditSummary(task.summary)
      setEditStartDate(toDateInputValue(task.startDate))
      setEditDeadline(toDateInputValue(getDueDateValue(task)))
      setEditUrgency(task.urgency || 3)
      setEditImpact(task.impact || 3)
      setEditNotes(task.userNotes || '')
      setEditStatus(task.status || 'pending')

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

        // 默认展开所有有子任务的项目
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

    // 自动完成父任务：如果所有子任务都完成，父任务也标记为完成
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

      // 如果刚勾选的是"waiting for reply"条目，直接完成 task
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

    // 所有条目都完成且 task 未完成 → 弹完成确认弹窗
    const allDone = next.length > 0 && next.every(i => i.completed)
    const taskNotDone = editStatus !== 'completed' && editStatus !== 'dismissed'
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
      id: generateId(),
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

    // 只能变成前一项的下一级，且最多到level 2
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
        <Button variant="ghost" onClick={() => router.push('/dashboard/tasks')} className="w-fit gap-2 px-0 text-gray-500 hover:bg-transparent hover:text-gray-900">
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
  const sts = statusConfig[task.status] || statusConfig.pending
  const StsIcon = sts.icon
  const project = task.project ?? null
  const matter = task.matter ?? null
  const threadId = task.emailLinks?.[0]?.email?.threadId ?? null

  return (
    <div className="animate-in fade-in duration-200">
      <Button variant="ghost" onClick={() => router.push('/dashboard/tasks')} className="w-fit gap-2 px-0 text-gray-500 hover:bg-transparent hover:text-gray-900">
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
          })} · ${task.emailLinks?.length || 0} linked email${task.emailLinks?.length === 1 ? '' : 's'}`}
        />

        <button
          onClick={() => setShowReassign(true)}
          className="group animate-fade-in-up stagger-2 flex w-full items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-2.5 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/50"
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
          <span className="ml-auto flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-500 shadow-sm group-hover:border-blue-300 group-hover:text-blue-600">
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

              {/* Quick actions for pending */}
              {task.status === 'pending' && (
                <InlineNotice variant="warning">
                  <div className="flex w-full items-center gap-3">
                    <span className="min-w-0 flex-1 text-left">This AI suggestion is waiting for you before it becomes active work.</span>
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      <Button size="sm" className="h-8 gap-1.5" onClick={() => handleStatusChange('confirmed')}>
                        <ThumbsUp className="h-3.5 w-3.5" />
                        Activate
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => handleStatusChange('dismissed')}>
                        <X className="h-3.5 w-3.5" />
                        Dismiss
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
                    <Button size="sm" variant="outline" className="ml-auto h-8 shrink-0 gap-1.5" onClick={() => handleStatusChange('confirmed')}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reopen
                    </Button>
                  </div>
                </InlineNotice>
              )}

              {/* Quick actions for dismissed */}
              {task.status === 'dismissed' && (
                <InlineNotice className="border-gray-200 bg-gray-50 text-gray-700">
                  <div className="flex w-full items-center gap-3">
                    <span className="min-w-0 flex-1 text-left">This task is currently dismissed. Bring it back if the email turns into real work later.</span>
                    <Button size="sm" variant="outline" className="ml-auto h-8 shrink-0 gap-1.5" onClick={() => handleStatusChange('pending')}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Back to AI Suggestions
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
                  <div className="mt-1 flex gap-2 items-center">
                    <Input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSave()
                          setEditingField(null)
                        }
                        if (e.key === 'Escape') setEditingField(null)
                      }}
                    />
                    <button
                      onClick={() => {
                        handleSave()
                        setEditingField(null)
                      }}
                      disabled={updateTask.isPending || actionCooldown}
                      className="shrink-0 p-1.5 hover:bg-blue-50 rounded transition-colors text-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Save"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditTitle(task.title)
                        setEditingField(null)
                      }}
                      disabled={updateTask.isPending || actionCooldown}
                      className="shrink-0 p-1.5 hover:bg-gray-100 rounded transition-colors text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
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
                  <div className="mt-1 flex gap-2">
                    <Textarea
                      autoFocus
                      value={editSummary}
                      onChange={(e) => setEditSummary(e.target.value)}
                      rows={3}
                    />
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => {
                          handleSave()
                          setEditingField(null)
                        }}
                        disabled={updateTask.isPending || actionCooldown}
                        className="shrink-0 p-1.5 hover:bg-blue-50 rounded transition-colors text-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Save"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditSummary(task.summary)
                          setEditingField(null)
                        }}
                        disabled={updateTask.isPending || actionCooldown}
                        className="shrink-0 p-1.5 hover:bg-gray-100 rounded transition-colors text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Cancel"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <p
                    onClick={() => setEditingField('summary')}
                    className="mt-1 text-sm text-gray-700 leading-relaxed py-2 px-2 -mx-2 rounded group-hover:bg-gray-50 transition-colors"
                  >
                    {task.summary || '—'}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-gray-100 bg-white/75 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Label className="text-xs text-gray-500">Schedule</Label>
                  {scheduleDuration ? (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">{scheduleDuration}</span>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-[11px] text-gray-400">Start date</Label>
                    <Input
                      type="date"
                      value={editStartDate}
                      onChange={(e) => setEditStartDate(e.target.value)}
                      onBlur={handleSave}
                      disabled={updateTask.isPending || actionCooldown}
                      className="mt-1 h-9 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-gray-400">Due date</Label>
                    <Input
                      type="date"
                      value={editDeadline}
                      onChange={(e) => setEditDeadline(e.target.value)}
                      onBlur={handleSave}
                      disabled={updateTask.isPending || actionCooldown}
                      className="mt-1 h-9 text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="cursor-text group">
                  <Label className="text-xs text-gray-500">Urgency</Label>
                  {editingField === 'urgency' ? (
                    <div className="mt-1 flex gap-2 items-center">
                      <Input
                        autoFocus
                        type="number"
                        min={1}
                        max={5}
                        value={editUrgency}
                        onChange={(e) => setEditUrgency(Number(e.target.value))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSave()
                            setEditingField(null)
                          }
                          if (e.key === 'Escape') setEditingField(null)
                        }}
                      />
                      <button
                        onClick={() => {
                          handleSave()
                          setEditingField(null)
                        }}
                        disabled={updateTask.isPending || actionCooldown}
                        className="shrink-0 p-1.5 hover:bg-blue-50 rounded transition-colors text-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Save"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditUrgency(task.urgency || 3)
                          setEditingField(null)
                        }}
                        disabled={updateTask.isPending || actionCooldown}
                        className="shrink-0 p-1.5 hover:bg-gray-100 rounded transition-colors text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Cancel"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
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
                    <div className="mt-1 flex gap-2 items-center">
                      <Input
                        autoFocus
                        type="number"
                        min={1}
                        max={5}
                        value={editImpact}
                        onChange={(e) => setEditImpact(Number(e.target.value))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSave()
                            setEditingField(null)
                          }
                          if (e.key === 'Escape') setEditingField(null)
                        }}
                      />
                      <button
                        onClick={() => {
                          handleSave()
                          setEditingField(null)
                        }}
                        disabled={updateTask.isPending || actionCooldown}
                        className="shrink-0 p-1.5 hover:bg-blue-50 rounded transition-colors text-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Save"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditImpact(task.impact || 3)
                          setEditingField(null)
                        }}
                        disabled={updateTask.isPending || actionCooldown}
                        className="shrink-0 p-1.5 hover:bg-gray-100 rounded transition-colors text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Cancel"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
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
                  <div className="mt-1 flex gap-2">
                    <Textarea
                      autoFocus
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.ctrlKey) {
                          handleSave()
                          setEditingField(null)
                        }
                        if (e.key === 'Escape') setEditingField(null)
                      }}
                      rows={2}
                      placeholder="Add personal notes..."
                    />
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => {
                          handleSave()
                          setEditingField(null)
                        }}
                        disabled={updateTask.isPending || actionCooldown}
                        className="shrink-0 p-1.5 hover:bg-blue-50 rounded transition-colors text-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Save"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditNotes(task.userNotes || '')
                          setEditingField(null)
                        }}
                        disabled={updateTask.isPending || actionCooldown}
                        className="shrink-0 p-1.5 hover:bg-gray-100 rounded transition-colors text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Cancel"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <p
                    onClick={() => setEditingField('notes')}
                    className="mt-1 text-sm text-gray-700 py-2 px-2 -mx-2 rounded group-hover:bg-gray-50 transition-colors"
                  >
                    {task.userNotes || '—'}
                  </p>
                )}
              </div>

              <div className="cursor-pointer group">
                <Label className="text-xs text-gray-500">Status</Label>
                <Select
                  value={editStatus}
                  onValueChange={(value) => { if (value) handleStatusChange(value) }}
                  disabled={updateTask.isPending || actionCooldown}
                >
                  <SelectTrigger className="mt-1.5 h-9 w-full max-w-xs bg-white text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start">
                    {Object.entries(statusConfig).map(([value, opt]) => (
                      <SelectItem key={value} value={value}>
                        <span className="font-medium">{opt.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* AI Analysis */}
          {task.priorityReason && (
            <Card className="animate-fade-in-up stagger-4 border-yellow-200 bg-gradient-to-br from-yellow-50/50 to-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-yellow-600" />
                  AI Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-yellow-800 leading-relaxed">{task.priorityReason}</p>
              </CardContent>
            </Card>
          )}

          {/* Checklist — fully editable */}
          {checklistItems.length > 0 && (
            <Card className="animate-fade-in-up stagger-5 border-white/70 bg-white/95 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <ListChecks className="h-4 w-4 text-blue-500" />
                    Checklist
                    <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                      {checklistItems.filter(i => i.completed).length}/{checklistItems.length}
                    </span>
                  </CardTitle>
                  <button
                    onClick={() => addItem()}
                    className="shrink-0 p-1 rounded-full hover:bg-blue-100 transition-colors text-blue-600 hover:text-blue-700"
                    title="Add item"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 px-3 pt-3">
                {/* Progress bar */}
                {checklistItems.length > 1 && (
                  <div className="mb-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-300"
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

                    // 检查是否应该显示这个项目
                    // 规则：顶层项目或其祖先项目都已展开
                    const shouldShow = (() => {
                      if (item.level === 0) return true
                      // 向上查找所有父项目，检查是否都展开
                      for (let i = idx - 1; i >= 0; i--) {
                        const ancestor = checklistItems[i]
                        if (ancestor.level < item.level) {
                          // 找到了父级
                          if (ancestor.level === item.level - 1) {
                            return expandedItems.has(ancestor.id)
                          }
                          // 继续向上找
                        } else if (ancestor.level === 0) {
                          // 到顶了，没找到父项
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
                            <CheckSquare className="h-4 w-4 text-blue-500" />
                          ) : (
                            <Square className="h-4 w-4 text-gray-300 group-hover:text-blue-400 transition-colors" />
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
                              className="w-full text-sm bg-blue-50 border border-blue-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                              className="p-1 hover:bg-gray-100 rounded transition-colors text-gray-400 hover:text-blue-600"
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
                            className="p-1 hover:bg-red-50 rounded transition-colors text-gray-400 hover:text-red-500"
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
          )}

          {/* Source Emails */}
          {task.emailLinks?.length > 0 && (
            <Card className="animate-fade-in-up stagger-6 border-white/70 bg-white/95 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-blue-600" />
                  Source Emails
                  <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">{task.emailLinks.length}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(task.emailLinks as TaskEmailLink[]).map((link) => {
                  const senderName = link.email.sender?.split('<')[0]?.trim()
                  const senderInitial = (senderName || 'U')[0].toUpperCase()
                  const isUnlinking = unlinkingEmailId === link.email.id
                  return (
                    <div
                      key={link.id}
                      className="flex items-center gap-3 rounded-lg border p-3 transition-all hover:bg-blue-50/50 hover:border-blue-200 group"
                    >
                      <Link
                        href={`/dashboard/emails/${link.email.id}`}
                        className="flex items-center gap-3 flex-1 min-w-0"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold">
                          {senderInitial}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                            {link.email.subject}
                          </p>
                          <p className="truncate text-xs text-gray-500">
                            {senderName} — {new Date(link.email.receivedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                          </p>
                        </div>
                        <ExternalLink className="h-4 w-4 text-gray-300 group-hover:text-blue-400 shrink-0 transition-colors" />
                      </Link>
                      <button
                        onClick={() => {
                          if (confirm('Remove this email from the task?')) {
                            unlinkEmail(link.email.id)
                          }
                        }}
                        disabled={isUnlinking}
                        className="shrink-0 p-1 rounded hover:bg-red-50 transition-colors text-gray-300 hover:text-red-500 disabled:opacity-50"
                        title="Remove email"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

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
                  id: generateId(),
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
