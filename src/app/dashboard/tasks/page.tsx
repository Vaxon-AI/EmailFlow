'use client'

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
import { SegmentedControl } from '@/components/segmented-control'
import { StatePanel } from '@/components/state-panel'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Check, X, Calendar, List, GanttChart,
  Plus, FolderOpen, Trash2,
  ChevronDown, ThumbsUp, Sparkles, MoreHorizontal,
} from 'lucide-react'
import { Suspense, useState, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { GanttTimeline } from '@/components/gantt-timeline'
import { ReassignProjectModal } from '@/components/reassign-project-modal'
import { BatchReassignModal } from '@/components/batch-reassign-modal'
import { UpgradeModal } from '@/components/upgrade-modal'
import { useAuth } from '@/lib/use-auth'
import { ScorePicker } from '@/components/score-picker'
import {
  type PriorityFilter,
  PRIORITY_LABELS,
  PRIORITY_OPTIONS,
  renderTaskTabNewBadge,
  parsePriorityFilter,
  parseStatusFilter,
  type StatusFilter,
  STATUS_OPTIONS,
  type TaskItem,
  type ViewMode,
  priorityBucketFromScore,
} from './task-page-types'
import { TaskCalendarView } from './task-calendar-view'
import { TaskDraftCard } from './task-draft-card'
import { TaskIdentityProjectPicker } from './task-identity-project-picker'
import { TaskLinkedEmailPicker } from './task-linked-email-picker'
import { TaskListView } from './task-list-view'
import { useTaskComposer } from './use-task-composer'
import { useTasksPageData } from './use-tasks-page-data'
import { useTasksPageActions } from './use-tasks-page-actions'

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
  const [showUpgrade, setShowUpgrade] = useState(false)
  const { user } = useAuth()
  const isPro = Boolean(user?.plan && user.plan !== 'free')
  const {
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
  } = useTaskComposer()
  const priorityFilterLabel = PRIORITY_OPTIONS.find((option) => option.value === priorityFilter)?.label ?? 'All priorities'
  const {
    res,
    isLoading,
    tasks: rawTasks,
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
  } = useTasksPageData({
    statusFilter,
    priorityFilter,
    sortBy,
    showCreateModal,
    showPasteTextModal,
    selectedIdentityId,
    selectedProjectId,
    linkedEmailIds,
    emailPickerQuery,
    plan: user?.plan,
  })
  const {
    creatingTask,
    handleGenerateTask,
    updateCard,
    removeCard,
    handleSuggestDates,
    handleCreateTask,
    updateTask,
    handleDeleteTask,
    batchOp,
  } = useTasksPageActions({
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

  const tasks = useMemo(() => {
    if (!dateFilter) return rawTasks
    return rawTasks.filter((t) => {
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
  }, [rawTasks, dateFilter])

  const bulkToggle = useCallback((ids: string[], select: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (select) ids.forEach((id) => next.add(id))
      else ids.forEach((id) => next.delete(id))
      return next
    })
  }, [setSelectedIds])

  const selectAll = () => setSelectedIds(new Set(tasks.map((t) => t.id)))

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
              <DropdownMenuTrigger className="group/trigger inline-flex h-8 items-center gap-2 rounded-md bg-brand-600 px-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 aria-expanded:bg-brand-700">
                <Plus className="h-4 w-4" />
                Create Task
                <ChevronDown className="h-3.5 w-3.5 opacity-80 transition-transform duration-150 group-aria-expanded/trigger:rotate-180" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => {
                    openManualTaskModal()
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
                    <span className="rounded-full bg-ai-50 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ai-700">
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
              options={STATUS_OPTIONS.map((o) =>
                o.value === 'completed'
                  ? {
                      ...o,
                      badge: renderTaskTabNewBadge(tabStateMap.get(o.value as StatusFilter)?.newCount ?? 0, o.value as StatusFilter),
                      // Cleanup options sit inside the Completed tab and only
                      // expand when this tab is active — keeps other tabs at
                      // their normal width.
                      trailing: (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="group/trigger inline-flex h-5 w-5 items-center justify-center rounded transition-[background-color,transform] duration-150 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/50 aria-expanded:scale-95 aria-expanded:bg-white/20"
                            title="Cleanup options for completed tasks"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5 transition-transform duration-150 group-aria-expanded/trigger:rotate-90" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-60 p-1.5">
                            <div className="px-1.5 py-1">
                              <p className="text-xs font-semibold text-gray-600">Auto-clean completed</p>
                              <p className="mt-0.5 text-[10px] text-gray-400">Clear standalone completed tasks after</p>
                            </div>
                            <div className="space-y-1">
                              {[7, 14, 30, 60].map((days) => {
                                const selected = taskRetainAfterDays === days
                                return (
                                  <DropdownMenuItem
                                    key={days}
                                    onClick={() => updateTaskRetainMutation.mutate(days)}
                                    className={`cursor-pointer justify-between rounded-lg px-2 py-1.5 text-xs transition-[background-color,color,transform] duration-150 hover:translate-x-0.5 ${
                                      selected
                                        ? 'bg-brand-50 text-brand-700 focus:bg-brand-50 focus:text-brand-700'
                                        : 'text-slate-600 focus:bg-slate-50 focus:text-slate-800'
                                    }`}
                                  >
                                    <span>{days} days</span>
                                    {selected ? <Check className="h-3.5 w-3.5 text-brand-600" /> : null}
                                  </DropdownMenuItem>
                                )
                              })}
                            </div>
                            <p className="mt-2 border-t border-slate-100 px-1.5 pt-2 text-[10px] leading-snug text-gray-400">
                              Standalone tasks deleted; tasks linked to emails are archived until the source emails are also removed.
                            </p>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ),
                    }
                  : {
                      ...o,
                      badge: renderTaskTabNewBadge(tabStateMap.get(o.value as StatusFilter)?.newCount ?? 0, o.value as StatusFilter),
                    }
              )}
            />
          </div>

          <div className="flex min-h-7 justify-start sm:min-w-[180px] sm:justify-end">
            {viewMode === 'list' ? (
              <div className="flex flex-wrap items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger className="group/trigger inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 shadow-sm transition-[background-color,border-color,color,box-shadow,transform] duration-150 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 aria-expanded:border-brand-300 aria-expanded:bg-brand-50 aria-expanded:text-brand-700">
                    {priorityFilterLabel}
                    <ChevronDown className="h-3.5 w-3.5 transition-transform duration-150 group-aria-expanded/trigger:rotate-180" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44 p-1.5">
                    {PRIORITY_OPTIONS.map((option) => {
                      const selected = priorityFilter === option.value
                      return (
                        <DropdownMenuItem
                          key={option.value}
                          onClick={() => handlePriorityFilterChange(option.value)}
                          className={`cursor-pointer justify-between rounded-lg px-2 py-1.5 text-xs transition-[background-color,color,transform] duration-150 hover:translate-x-0.5 ${
                            selected
                              ? 'bg-brand-50 text-brand-700 focus:bg-brand-50 focus:text-brand-700'
                              : 'text-slate-600 focus:bg-slate-50 focus:text-slate-800'
                          }`}
                        >
                          <span>{option.label}</span>
                          {selected ? <Check className="h-3.5 w-3.5 text-brand-600" /> : null}
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
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
        <div className="animate-soft-enter flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/75 px-4 py-2.5 shadow-sm">
          <span className="text-sm font-medium text-brand-700">{selectedIds.size} selected</span>
          {selectedIds.size < tasks.length && (
            <button onClick={selectAll} className="text-xs text-brand-500 hover:text-brand-700 hover:underline">
              Select all {tasks.length}
            </button>
          )}
          <div className="flex-1" />
          <Button size="sm" variant="brandSoft" className="h-7 text-xs" onClick={() => batchOp('activate')}>
            <ThumbsUp className="mr-1 h-3 w-3" /> Activate
          </Button>
          <Button size="sm" variant="success" className="h-7 text-xs" onClick={() => batchOp('complete')}>
            <Check className="mr-1 h-3 w-3" /> Mark Done
          </Button>
          <Button size="sm" variant="utility" className="h-7 gap-1 text-xs" onClick={() => setShowBatchReassign(true)}>
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
            key={`${statusFilter}-${priorityFilter}-${sortBy}`}
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
              <div className="flex items-center justify-between rounded-lg border border-ai-100 bg-ai-50 px-3 py-2 text-xs text-ai-700">
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
                    <TaskDraftCard
                      key={idx}
                      card={card}
                      onChange={(patch) => updateCard(idx, patch)}
                      onRemove={() => removeCard(idx)}
                    />
                  ))}
                </div>

                <TaskIdentityProjectPicker
                  identities={identities}
                  filteredProjects={filteredProjects}
                  selectedIdentityId={selectedIdentityId}
                  selectedIdentityName={selectedIdentityName}
                  selectedProjectId={selectedProjectId}
                  selectedProjectName={selectedProjectName}
                  onIdentityChange={handleIdentityChange}
                  onProjectChange={setSelectedProjectId}
                />
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
      <Dialog open={showCreateModal} onOpenChange={handleCreateModalOpenChange}>
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

            <TaskIdentityProjectPicker
              identities={identities}
              filteredProjects={filteredProjects}
              selectedIdentityId={selectedIdentityId}
              selectedIdentityName={selectedIdentityName}
              selectedProjectId={selectedProjectId}
              selectedProjectName={selectedProjectName}
              onIdentityChange={handleIdentityChange}
              onProjectChange={setSelectedProjectId}
            />

            <TaskLinkedEmailPicker
              emailPickerOpen={emailPickerOpen}
              emailPickerQuery={emailPickerQuery}
              filteredEmails={filteredEmails}
              linkedEmailIds={linkedEmailIds}
              linkedEmails={linkedEmails}
              recentEmails={recentEmails}
              selectedIdentityName={selectedIdentityName}
              selectedProjectName={selectedProjectName}
              setEmailPickerOpen={setEmailPickerOpen}
              setEmailPickerQuery={setEmailPickerQuery}
              setLinkedEmailIds={setLinkedEmailIds}
            />

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
              {/* Urgency × Impact → priorityScore. Display still uses the
                  band (critical / high / medium / low) computed from the
                  product, so list chips don't change. */}
              <div className="grid grid-cols-2 gap-3">
                <ScorePicker
                  label="Urgency"
                  value={draftUrgency}
                  onChange={(v) => {
                    setDraftUrgency(v)
                    setDraftPriorityScore(v * draftImpact)
                  }}
                />
                <ScorePicker
                  label="Impact"
                  value={draftImpact}
                  onChange={(v) => {
                    setDraftImpact(v)
                    setDraftPriorityScore(draftUrgency * v)
                  }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {PRIORITY_LABELS[priorityBucketFromScore(draftUrgency * draftImpact)]} · score {draftUrgency * draftImpact}
              </p>
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
