'use client'

import { Suspense, useCallback, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  CalendarDays,
  Check,
  CheckSquare,
  ChevronDown,
  FolderOpen,
  GanttChartSquare,
  List,
  Plus,
  Sparkles,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { SegmentedControl } from '@/components/segmented-control'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { GanttTimeline } from '@/components/gantt-timeline'
import { getPriorityBand } from '@/types'
import { useDemoStore } from '@/lib/demo/store'
import { type DemoTask, type DemoTaskStatus } from '@/lib/demo/types'
import { DemoTaskListView } from '../_components/demo-task-list-view'
import { DemoCalendar } from '../_components/demo-calendar'
import { DemoCreateTaskModal } from '../_components/demo-create-task-modal'
import { DemoBatchReassignModal } from '../_components/demo-batch-reassign-modal'
import { DemoPasteTextDialog } from '../_components/demo-paste-text-dialog'
import { EmptyHint } from '../_components/demo-bits'

type ViewMode = 'list' | 'timeline' | 'calendar'
type StatusFilter = 'all' | DemoTaskStatus
type PriorityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low'

const STATUS_VALUES: ReadonlySet<string> = new Set([
  'all',
  'ai_suggestion',
  'active',
  'completed',
])

const PRIORITY_VALUES: ReadonlySet<string> = new Set([
  'all',
  'critical',
  'high',
  'medium',
  'low',
])

function parseStatus(value: string | null): StatusFilter {
  return value && STATUS_VALUES.has(value) ? (value as StatusFilter) : 'all'
}

function parsePriority(value: string | null): PriorityFilter {
  return value && PRIORITY_VALUES.has(value) ? (value as PriorityFilter) : 'all'
}

export default function DemoTasksPage() {
  return (
    <Suspense fallback={null}>
      <TasksContent />
    </Suspense>
  )
}

function TasksContent() {
  const { tasks, toTimelineTasks, updateTaskDates, setTaskStatus, deleteTask } = useDemoStore()
  const router = useRouter()
  const searchParams = useSearchParams()
  const statusFilter = parseStatus(searchParams.get('status'))
  const priorityFilter = parsePriority(searchParams.get('priority'))
  const focusProjectId = searchParams.get('project') ?? undefined
  const [view, setView] = useState<ViewMode>('list')
  const [createOpen, setCreateOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)

  // Selection state is scoped to the current status filter — switching filters
  // clears it (mirrors real tasks page L207-221, L655).
  const [selection, setSelection] = useState<{ status: StatusFilter; ids: Set<string> }>({
    status: statusFilter,
    ids: new Set(),
  })
  // Memoised so the empty-Set fallback doesn't churn downstream useMemos.
  const selectedIds = useMemo<Set<string>>(
    () => (selection.status === statusFilter ? selection.ids : new Set<string>()),
    [selection, statusFilter],
  )
  const setSelectedIds = useCallback(
    (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      setSelection((prev) => {
        const current = prev.status === statusFilter ? prev.ids : new Set<string>()
        const ids = typeof updater === 'function' ? updater(current) : updater
        return { status: statusFilter, ids }
      })
    },
    [statusFilter],
  )

  const [showBatchReassign, setShowBatchReassign] = useState(false)

  const setStatusFilter = (next: StatusFilter) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'all') params.delete('status')
    else params.set('status', next)
    const q = params.toString()
    router.replace(q ? `/demo/tasks?${q}` : '/demo/tasks', { scroll: false })
  }

  const counts = useMemo(
    () => ({
      pending: tasks.filter((t) => t.status === 'ai_suggestion').length,
      active: tasks.filter((t) => t.status === 'active').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
    }),
    [tasks],
  )

  const visibleTasks = useMemo<DemoTask[]>(() => {
    let result = tasks
    if (statusFilter === 'all') {
      // Mirror real `scope=open` — "All" surfaces actionable tasks only;
      // completed lives in its own tab. (dashboard/tasks/page.tsx L254-265.)
      result = result.filter((t) => t.status === 'ai_suggestion' || t.status === 'active')
    } else {
      result = result.filter((t) => t.status === statusFilter)
    }
    if (priorityFilter !== 'all') {
      result = result.filter((t) => getPriorityBand(t.priorityScore) === priorityFilter)
    }
    return result
  }, [tasks, statusFilter, priorityFilter])

  const ganttUpdate = useMemo(
    () => ({
      mutate: (
        vars: { id: string; data: { startDate?: string; userSetDeadline?: string } },
        opts?: { onSuccess?: () => void },
      ) => {
        updateTaskDates(vars.id, vars.data)
        opts?.onSuccess?.()
      },
    }),
    [updateTaskDates],
  )

  const toggleSelect = useCallback(
    (id: string) =>
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    [setSelectedIds],
  )

  const bulkToggle = useCallback(
    (ids: string[], select: boolean) =>
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (select) ids.forEach((id) => next.add(id))
        else ids.forEach((id) => next.delete(id))
        return next
      }),
    [setSelectedIds],
  )

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [setSelectedIds])
  const selectAll = () => setSelectedIds(new Set(visibleTasks.map((t) => t.id)))

  const batchOp = (action: 'activate' | 'complete' | 'delete') => {
    const ids = [...selectedIds]
    if (action === 'delete') {
      // Mirror real batch delete — hard-remove from the store.
      // (real: src/app/api/tasks/batch/route.ts:34-36 → taskRepo.deleteManyTasks)
      for (const id of ids) deleteTask(id)
      toast.success(`${ids.length} task${ids.length === 1 ? '' : 's'} deleted`)
    } else {
      const status: DemoTaskStatus = action === 'activate' ? 'active' : 'completed'
      for (const id of ids) setTaskStatus(id, status)
      const verb = action === 'activate' ? 'activated' : 'completed'
      toast.success(`${ids.length} task${ids.length === 1 ? '' : 's'} ${verb}`)
    }
    clearSelection()
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tasks"
        description="Everything EmailFlow pulled out of your inbox, ranked by what matters first."
        meta={`${counts.pending + counts.active} open · ${counts.completed} completed`}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700">
              <Plus className="h-4 w-4" />
              New task
              <ChevronDown className="h-3.5 w-3.5 opacity-80" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => setCreateOpen(true)} className="cursor-pointer gap-2">
                <Plus className="h-3.5 w-3.5" />
                Manual Task
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPasteOpen(true)} className="cursor-pointer gap-2">
                <Sparkles className="h-3.5 w-3.5" />
                Paste Text
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'ai_suggestion', label: 'AI Suggestions' },
            { value: 'active', label: 'Active' },
            { value: 'completed', label: 'Completed' },
          ]}
        />
        <SegmentedControl
          value={view}
          onChange={(v) => setView(v as ViewMode)}
          options={[
            { value: 'list', label: 'List', icon: <List className="h-3.5 w-3.5" /> },
            { value: 'timeline', label: 'Timeline', icon: <GanttChartSquare className="h-3.5 w-3.5" /> },
            { value: 'calendar', label: 'Calendar', icon: <CalendarDays className="h-3.5 w-3.5" /> },
          ]}
        />
      </div>

      {priorityFilter !== 'all' && (
        <div className="flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-xs text-brand-700">
          <span>
            Filtered to <strong className="capitalize">{priorityFilter}</strong> priority. Showing {visibleTasks.length} task
            {visibleTasks.length === 1 ? '' : 's'}.
          </span>
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString())
              params.delete('priority')
              const q = params.toString()
              router.replace(q ? `/demo/tasks?${q}` : '/demo/tasks', { scroll: false })
            }}
            className="ml-auto text-xs font-medium text-brand-600 hover:text-brand-800"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Batch action bar — only renders when something is selected. Mirrors
          real tasks page L1041-1066. */}
      {selectedIds.size > 0 && view === 'list' && (
        <div className="animate-soft-enter flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/75 px-4 py-2.5 shadow-sm">
          <span className="text-sm font-medium text-brand-700">{selectedIds.size} selected</span>
          {selectedIds.size < visibleTasks.length && (
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-brand-500 hover:text-brand-700 hover:underline"
            >
              Select all {visibleTasks.length}
            </button>
          )}
          <div className="flex-1" />
          <Button
            size="sm"
            variant="brandSoft"
            className="h-7 text-xs"
            onClick={() => batchOp('activate')}
          >
            <ThumbsUp className="mr-1 h-3 w-3" />
            Activate
          </Button>
          <Button
            size="sm"
            variant="success"
            className="h-7 text-xs"
            onClick={() => batchOp('complete')}
          >
            <Check className="mr-1 h-3 w-3" />
            Mark Done
          </Button>
          <Button
            size="sm"
            variant="utility"
            className="h-7 gap-1 text-xs"
            onClick={() => setShowBatchReassign(true)}
          >
            <FolderOpen className="h-3 w-3" />
            Change Project
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 text-xs"
            onClick={() => batchOp('delete')}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Delete
          </Button>
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Clear selection"
            className="ml-1 rounded p-1 text-brand-400 hover:bg-brand-100 hover:text-brand-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {view === 'list' &&
        (visibleTasks.length === 0 ? (
          <EmptyHint icon={<CheckSquare className="h-5 w-5" />} text="No tasks in this view." />
        ) : (
          <DemoTaskListView
            tasks={visibleTasks}
            focusProjectId={focusProjectId}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onBulkToggle={bulkToggle}
          />
        ))}

      {view === 'timeline' &&
        (visibleTasks.length === 0 ? (
          <EmptyHint
            icon={<GanttChartSquare className="h-5 w-5" />}
            text="No tasks to place on the timeline."
          />
        ) : (
          <GanttTimeline tasks={toTimelineTasks(visibleTasks)} updateTask={ganttUpdate} />
        ))}

      {view === 'calendar' && <DemoCalendar tasks={visibleTasks} />}

      <DemoCreateTaskModal open={createOpen} onClose={() => setCreateOpen(false)} />

      <DemoPasteTextDialog open={pasteOpen} onOpenChange={setPasteOpen} />

      <DemoBatchReassignModal
        open={showBatchReassign}
        onOpenChange={setShowBatchReassign}
        ids={[...selectedIds]}
        entity="task"
        onSuccess={clearSelection}
      />
    </div>
  )
}
