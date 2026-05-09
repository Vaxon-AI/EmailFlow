'use client'

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { MonthYearPanel } from '@/components/month-year-panel'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ChevronDown, ChevronLeft, ChevronRight, FolderOpen, GripVertical, UserRound } from 'lucide-react'
import { getPriorityBand } from '@/types'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'

const DAY_MS = 86400000
const COL_WIDTH = 48
const ROW_HEIGHT = 60
const LABEL_WIDTH = 240
const HANDLE_WIDTH = 10
const TIMELINE_ORDER_STORAGE_KEY = 'emailflow-ai:timeline-order'

type TimelineTask = {
  id: string
  title: string
  status: 'pending' | 'confirmed' | 'completed' | 'dismissed'
  priorityScore?: number | null
  startDate?: string | null
  explicitDeadline?: string | null
  inferredDeadline?: string | null
  userSetDeadline?: string | null
  project?: {
    id: string
    name: string
    identity: { id: string; name: string } | null
  } | null
  matter?: { id: string; title: string } | null
}

type UpdateTaskMutation = {
  mutate: (
    vars: { id: string; data: { startDate?: string; userSetDeadline?: string } },
    options?: { onSuccess?: () => void; onError?: () => void }
  ) => void
}

type DragState = {
  taskId: string
  mode: 'move' | 'resize-left' | 'resize-right'
  origStart: Date
  origEnd: Date
  startX: number
}

type DragSnapshot = Omit<DragState, 'startX'> & { delta: number }

type PendingPosition = {
  taskId: string
  start: Date
  end: Date
}

function toDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function formatShort(d: Date) {
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}
function startOfDay(d: Date) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function startOfWeek(d: Date) {
  const r = startOfDay(d)
  r.setDate(r.getDate() - r.getDay())
  return r
}
function diffDays(a: Date, b: Date) {
  const aNoon = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 12)
  const bNoon = new Date(b.getFullYear(), b.getMonth(), b.getDate(), 12)
  return Math.round((aNoon.getTime() - bNoon.getTime()) / DAY_MS)
}

function intersectsRange(
  start: Date | null,
  end: Date | null,
  rangeStart: Date,
  rangeEnd: Date
) {
  if (!start || !end) return false
  return start <= rangeEnd && end >= rangeStart
}

function getTaskStart(task: TimelineTask): Date | null {
  if (task.startDate) return startOfDay(new Date(task.startDate))
  const end = getTaskEnd(task)
  if (end) return addDays(end, -2)
  return null
}
function getTaskEnd(task: TimelineTask): Date | null {
  const raw = task.userSetDeadline || task.explicitDeadline || task.inferredDeadline
  return raw ? startOfDay(new Date(raw)) : null
}

const BAND_COLORS: Record<string, { bar: string; border: string; text: string }> = {
  critical: { bar: 'bg-critical-50', border: 'border-critical-100', text: 'text-critical-700' },
  high:     { bar: 'bg-orange-50',   border: 'border-orange-100',   text: 'text-orange-700' },
  medium:   { bar: 'bg-yellow-50',   border: 'border-yellow-100',   text: 'text-yellow-700' },
  low:      { bar: 'bg-slate-100',   border: 'border-slate-200',    text: 'text-slate-600' },
}

interface Props {
  tasks: TimelineTask[]
  updateTask: UpdateTaskMutation
}

export function GanttTimeline({ tasks, updateTask }: Props) {
  const today = useMemo(() => startOfDay(new Date()), [])
  const [rangeStart, setRangeStart] = useState(() => addDays(today, -3))
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerMonth, setPickerMonth] = useState(() => startOfDay(new Date()))
  const [transitionStage, setTransitionStage] = useState<'idle' | 'out' | 'in'>('idle')
  const [manualOrderIds, setManualOrderIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []

    try {
      const raw = window.localStorage.getItem(TIMELINE_ORDER_STORAGE_KEY)
      if (!raw) return []

      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
    } catch {
      return []
    }
  })
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dropTargetTaskId, setDropTargetTaskId] = useState<string | null>(null)
  const [collapsedIdentities, setCollapsedIdentities] = useState<Set<string>>(new Set())
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())
  const totalDays = 21
  const transitionTimeoutRef = useRef<number | null>(null)

  const days = useMemo(() => {
    const arr: Date[] = []
    for (let i = 0; i < totalDays; i++) arr.push(addDays(rangeStart, i))
    return arr
  }, [rangeStart, totalDays])

  // Sort tasks by due date ascending (no date → bottom)
  const visibleTasks = useMemo(() => {
    const rangeEnd = addDays(rangeStart, totalDays - 1)

    return tasks.filter((task) => {
      const taskStart = getTaskStart(task)
      const taskEnd = getTaskEnd(task)
      return intersectsRange(taskStart, taskEnd, rangeStart, rangeEnd)
    })
  }, [tasks, rangeStart, totalDays])

  const taskOrderLookup = useMemo(() => {
    const map = new Map<string, number>()
    manualOrderIds.forEach((id, index) => {
      map.set(id, index)
    })
    return map
  }, [manualOrderIds])

  const visibleTaskLookup = useMemo(() => {
    const map = new Map<string, TimelineTask>()
    visibleTasks.forEach((task) => {
      map.set(task.id, task)
    })
    return map
  }, [visibleTasks])

  const sortedTasks = useMemo(() => {
    return [...visibleTasks].sort((a, b) => {
      const aCompleted = a.status === 'completed'
      const bCompleted = b.status === 'completed'

      if (aCompleted !== bCompleted) {
        return aCompleted ? 1 : -1
      }

      const aManual = taskOrderLookup.get(a.id)
      const bManual = taskOrderLookup.get(b.id)
      if (aManual !== undefined || bManual !== undefined) {
        if (aManual === undefined) return 1
        if (bManual === undefined) return -1
        if (aManual !== bManual) return aManual - bManual
      }
      // Default timeline order: priority first unless the user has manually reordered tasks.
      const scoreDiff = (b.priorityScore || 0) - (a.priorityScore || 0)
      if (scoreDiff !== 0) return scoreDiff
      return a.id < b.id ? -1 : 1
    })
  }, [visibleTasks, taskOrderLookup])

  const toggleIdentity = useCallback((id: string) => {
    setCollapsedIdentities((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleProject = useCallback((id: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const groupedTimeline = useMemo(() => {
    type ProjectGroup = { id: string; name: string; tasks: TimelineTask[] }
    type IdentityGroup = { id: string; name: string; projects: ProjectGroup[] }

    const orderTasks = (items: TimelineTask[]) => {
      const active = items.filter((task) => task.status !== 'completed' && task.status !== 'dismissed')
      const done = items.filter((task) => task.status === 'completed' || task.status === 'dismissed')
      return [...active, ...done]
    }

    const latestScore = (items: TimelineTask[]) => Math.max(...items.map((task) => task.priorityScore ?? 0), 0)

    const identityMap = new Map<string, { name: string; projectMap: Map<string, { name: string; tasks: TimelineTask[] }> }>()
    const ungrouped: TimelineTask[] = []

    for (const task of sortedTasks) {
      if (!task.project) {
        ungrouped.push(task)
        continue
      }

      const identityId = task.project.identity?.id || '__unassigned__'
      const identityName = task.project.identity?.name || 'Unassigned'
      const projectId = task.project.id
      const projectName = task.project.name

      if (!identityMap.has(identityId)) {
        identityMap.set(identityId, { name: identityName, projectMap: new Map() })
      }

      const identity = identityMap.get(identityId)!
      if (!identity.projectMap.has(projectId)) {
        identity.projectMap.set(projectId, { name: projectName, tasks: [] })
      }
      identity.projectMap.get(projectId)!.tasks.push(task)
    }

    const identities: IdentityGroup[] = Array.from(identityMap.entries())
      .map(([id, { name, projectMap }]) => {
        const projects = Array.from(projectMap.entries())
          .map(([projectId, { name: projectName, tasks }]) => ({
            id: projectId,
            name: projectName,
            tasks: orderTasks(tasks),
          }))
          .sort((a, b) => latestScore(b.tasks) - latestScore(a.tasks))

        return { id, name, projects }
      })
      .sort((a, b) => latestScore(b.projects.flatMap((project) => project.tasks)) - latestScore(a.projects.flatMap((project) => project.tasks)))

    return { identities, ungrouped: orderTasks(ungrouped) }
  }, [sortedTasks])

  // Drag state
  const dragRef = useRef<DragState | null>(null)
  const deltaRef = useRef(0)
  const [, forceRender] = useState(0)
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null)
  const [dragSnapshot, setDragSnapshot] = useState<DragSnapshot | null>(null)

  // Pending override: holds final position after mouseup until React Query data arrives
  // Prevents the visual snap-back between mutation start and data refresh
  const pendingRef = useRef<PendingPosition | null>(null)
  const [pendingSnapshot, setPendingSnapshot] = useState<PendingPosition | null>(null)

  const startDrag = useCallback(
    (e: React.MouseEvent, taskId: string, mode: 'move' | 'resize-left' | 'resize-right', origStart: Date, origEnd: Date) => {
      e.preventDefault()
      e.stopPropagation()
      dragRef.current = { taskId, mode, origStart, origEnd, startX: e.clientX }
      deltaRef.current = 0
      setDragSnapshot({ taskId, mode, origStart, origEnd, delta: 0 })
      forceRender((n) => n + 1)
    }, []
  )

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.startX
      const newDelta = Math.round(dx / COL_WIDTH)
      if (newDelta !== deltaRef.current) {
        deltaRef.current = newDelta
        setDragSnapshot({
          taskId: dragRef.current.taskId,
          mode: dragRef.current.mode,
          origStart: dragRef.current.origStart,
          origEnd: dragRef.current.origEnd,
          delta: newDelta,
        })
        forceRender((n) => n + 1)
      }
    }

    const onUp = () => {
      const drag = dragRef.current
      const delta = deltaRef.current

      if (!drag) {
        dragRef.current = null
        deltaRef.current = 0
        setDragSnapshot(null)
        forceRender((n) => n + 1)
        return
      }

      let newStart = drag.origStart
      let newEnd = drag.origEnd

      if (delta !== 0) {
        if (drag.mode === 'move') {
          newStart = addDays(drag.origStart, delta)
          newEnd = addDays(drag.origEnd, delta)
        } else if (drag.mode === 'resize-left') {
          newStart = addDays(drag.origStart, delta)
          if (newStart >= newEnd) newStart = addDays(newEnd, -1)
        } else if (drag.mode === 'resize-right') {
          newEnd = addDays(drag.origEnd, delta)
          if (newEnd <= newStart) newEnd = addDays(newStart, 1)
        }

        // Lock the bar at the dropped position immediately so there's no snap-back
        pendingRef.current = { taskId: drag.taskId, start: newStart, end: newEnd }
        setPendingSnapshot({ taskId: drag.taskId, start: newStart, end: newEnd })
      }

      dragRef.current = null
      deltaRef.current = 0
      setDragSnapshot(null)
      forceRender((n) => n + 1)

      if (delta !== 0) {
        updateTask.mutate(
          { id: drag.taskId, data: { startDate: toDateStr(newStart), userSetDeadline: toDateStr(newEnd) } },
          {
            onSuccess: () => {
              pendingRef.current = null
              setPendingSnapshot(null)
              toast.success('Timeline updated')
            },
            onError: () => {
              pendingRef.current = null
              setPendingSnapshot(null)
              forceRender((n) => n + 1)
              showError('Failed to update timeline')
            },
          }
        )
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [updateTask])

  // Bar position — priority: live drag > pending override > task data
  const getBarStyle = useCallback(
    (task: TimelineTask, activeDrag: DragSnapshot | null, activePending: PendingPosition | null) => {
      let taskStart: Date | null
      let taskEnd: Date | null

      const drag = activeDrag
      const delta = activeDrag?.delta ?? 0

      if (drag && drag.taskId === task.id && delta !== 0) {
        // Live drag in progress
        if (drag.mode === 'move') {
          taskStart = addDays(drag.origStart, delta)
          taskEnd = addDays(drag.origEnd, delta)
        } else if (drag.mode === 'resize-left') {
          taskStart = addDays(drag.origStart, delta)
          taskEnd = drag.origEnd
          if (taskStart >= taskEnd) taskStart = addDays(taskEnd, -1)
        } else {
          taskStart = drag.origStart
          taskEnd = addDays(drag.origEnd, delta)
          if (taskEnd <= taskStart) taskEnd = addDays(taskStart, 1)
        }
      } else if (activePending?.taskId === task.id) {
        const pending = activePending
        const liveEnd = getTaskEnd(task)
        const liveStart = getTaskStart(task)
        // If task data has caught up to the pending position, clear and use real data
        if (
          liveEnd && liveStart &&
          toDateStr(liveEnd) === toDateStr(pending.end) &&
          toDateStr(liveStart) === toDateStr(pending.start)
        ) {
          taskStart = liveStart
          taskEnd = liveEnd
        } else {
          // Still waiting — hold bar at dropped position to avoid snap
          taskStart = pending.start
          taskEnd = pending.end
        }
      } else {
        // Normal: read from task data
        taskStart = getTaskStart(task)
        taskEnd = getTaskEnd(task)
      }

      if (!taskStart || !taskEnd) return null
      if (taskEnd <= taskStart) taskEnd = addDays(taskStart, 1)

      const left = diffDays(taskStart, rangeStart) * COL_WIDTH
      const width = Math.max(diffDays(taskEnd, taskStart) + 1, 1) * COL_WIDTH
      return { left, width, taskStart, taskEnd }
    },
    [rangeStart]
  )

  const getGroupSpan = useCallback((items: TimelineTask[]) => {
    const dated = items
      .map((task) => {
        const start = getTaskStart(task)
        const end = getTaskEnd(task)
        if (!start || !end) return null
        return { start, end }
      })
      .filter((item): item is { start: Date; end: Date } => item !== null)

    if (dated.length === 0) return null

    const start = dated.reduce((min, item) => (item.start < min ? item.start : min), dated[0].start)
    const end = dated.reduce((max, item) => (item.end > max ? item.end : max), dated[0].end)
    const left = diffDays(start, rangeStart) * COL_WIDTH
    const width = Math.max(diffDays(end, start) + 1, 1) * COL_WIDTH

    return { start, end, left, width }
  }, [rangeStart])

  const todayOffset = diffDays(today, rangeStart) * COL_WIDTH
  const gridWidth = totalDays * COL_WIDTH
  const rangeEnd = addDays(rangeStart, totalDays - 1)
  const rangeLabel = `${formatShort(rangeStart)} - ${formatShort(rangeEnd)}, ${rangeEnd.getFullYear()}`

  const weekOptions = useMemo(() => {
    const monthStart = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), 1)
    const monthEnd = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 0)
    const weeks: Date[] = []
    let cursor = startOfWeek(monthStart)

    while (cursor <= monthEnd || weeks.length < 5) {
      weeks.push(new Date(cursor))
      cursor = addDays(cursor, 7)
      if (weeks.length > 6) {
        break
      }
    }

    return weeks
  }, [pickerMonth])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(TIMELINE_ORDER_STORAGE_KEY, JSON.stringify(manualOrderIds))
  }, [manualOrderIds])

  const transitionToRange = useCallback((nextStart: Date) => {
    if (transitionTimeoutRef.current) {
      window.clearTimeout(transitionTimeoutRef.current)
    }

    setTransitionStage('out')
    transitionTimeoutRef.current = window.setTimeout(() => {
      setRangeStart(startOfDay(nextStart))
      setTransitionStage('in')
      transitionTimeoutRef.current = window.setTimeout(() => {
        setTransitionStage('idle')
        transitionTimeoutRef.current = null
      }, 200)
    }, 140)
  }, [])

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        window.clearTimeout(transitionTimeoutRef.current)
      }
    }
  }, [])

  const reorderTasks = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) return

    const sourceTask = visibleTaskLookup.get(sourceId)
    const targetTask = visibleTaskLookup.get(targetId)
    if (!sourceTask || !targetTask) return

    const sourceProjectId = sourceTask.project?.id || '__ungrouped__'
    const targetProjectId = targetTask.project?.id || '__ungrouped__'
    if (sourceProjectId !== targetProjectId) {
      toast.warning('Reorder tasks within the same project section')
      return
    }

    const visibleIds = sortedTasks.map((task) => task.id)
    const sourceIndex = visibleIds.indexOf(sourceId)
    const targetIndex = visibleIds.indexOf(targetId)

    if (sourceIndex === -1 || targetIndex === -1) return

    const nextVisible = [...visibleIds]
    const [moved] = nextVisible.splice(sourceIndex, 1)
    nextVisible.splice(targetIndex, 0, moved)

    const visibleSet = new Set(visibleIds)
    const existing = manualOrderIds.filter((id) => !visibleSet.has(id))
    setManualOrderIds([...nextVisible, ...existing])
  }, [manualOrderIds, sortedTasks, visibleTaskLookup])

  const canReorderWithinSection = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) return false

    const sourceTask = visibleTaskLookup.get(sourceId)
    const targetTask = visibleTaskLookup.get(targetId)
    if (!sourceTask || !targetTask) return false

    const sourceProjectId = sourceTask.project?.id || '__ungrouped__'
    const targetProjectId = targetTask.project?.id || '__ungrouped__'
    if (sourceProjectId !== targetProjectId) return false

    const sourceDone = sourceTask.status === 'completed' || sourceTask.status === 'dismissed'
    const targetDone = targetTask.status === 'completed' || targetTask.status === 'dismissed'
    if (sourceDone !== targetDone) return false

    return true
  }, [visibleTaskLookup])

  return (
    <Card className="border-gray-200/80 bg-white/95 shadow-sm">
      <CardContent className="min-w-0 overflow-hidden py-4">
        {/* Controls */}
        <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex items-center gap-2 justify-self-start">
            <Button variant="ghost" size="sm" onClick={() => transitionToRange(addDays(rangeStart, -7))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => transitionToRange(addDays(today, -3))} className="text-xs">
              Today
            </Button>
            <Button variant="ghost" size="sm" onClick={() => transitionToRange(addDays(rangeStart, 7))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger className="justify-self-center rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-900 transition-colors hover:bg-brand-50 hover:text-brand-700">
              {rangeLabel}
            </PopoverTrigger>
            <PopoverContent align="center" className="w-[320px] rounded-2xl border border-gray-200 bg-white p-3 shadow-lg">
              <div className="space-y-3">
                <MonthYearPanel
                  value={pickerMonth}
                  onChange={(date) => setPickerMonth(date)}
                />
                <div className="space-y-2 border-t border-gray-100 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                    Weeks In {pickerMonth.toLocaleDateString('en', { month: 'long', year: 'numeric' })}
                  </p>
                  <div className="space-y-2">
                    {weekOptions.map((weekStart) => {
                      const weekEnd = addDays(weekStart, 6)
                      const active = rangeStart.toDateString() === weekStart.toDateString()

                      return (
                        <button
                          key={weekStart.toISOString()}
                          type="button"
                          onClick={() => {
                            transitionToRange(weekStart)
                            setPickerOpen(false)
                          }}
                          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                            active
                              ? 'border-brand-300 bg-brand-100 text-blue-900'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700'
                          }`}
                        >
                          <span className="font-medium">Week of {formatShort(weekStart)}</span>
                          <span className="text-xs opacity-80">{formatShort(weekEnd)}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <div className="justify-self-end text-right">
            <span className="text-xs text-gray-400">21-day range</span>
          </div>
        </div>

        <div
          className={`transition-all duration-300 ease-out ${
            transitionStage === 'out'
              ? 'translate-y-1.5 scale-[0.992] opacity-0 blur-[1px]'
              : transitionStage === 'in'
                ? 'translate-y-0 scale-[1.005] opacity-100 blur-0'
                : 'translate-y-0 scale-100 opacity-100 blur-0'
          }`}
        >
        {sortedTasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 px-4 py-10 text-center">
            <p className="text-sm font-medium text-gray-700">No active tasks in this timeline window</p>
            <p className="mt-1 text-xs text-gray-500">
              Try a different week, or switch back to list or calendar to see tasks outside this range.
            </p>
          </div>
        ) : (
        <div className="max-w-full overflow-x-auto pb-1">
            <div style={{ minWidth: LABEL_WIDTH + gridWidth }} className="select-none">
            {/* Day headers */}
            <div className="flex border-b" style={{ height: 40 }}>
              <div style={{ width: LABEL_WIDTH }} className="shrink-0 border-r px-3 text-xs font-medium text-gray-500 flex items-end pb-1">
                Task
              </div>
              <div className="relative flex">
                {days.map((day) => {
                  const isToday = day.toDateString() === today.toDateString()
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6
                  return (
                    <div
                      key={day.toISOString()}
                      style={{ width: COL_WIDTH }}
                      className={`shrink-0 border-r text-center text-[10px] flex flex-col justify-end pb-1 ${
                        isToday ? 'bg-brand-50 font-bold text-brand-700' : isWeekend ? 'bg-gray-50 text-gray-400' : 'text-gray-500'
                      }`}
                    >
                      <div>{day.toLocaleDateString('en', { weekday: 'narrow' })}</div>
                      <div>{day.getDate()}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Task rows grouped by identity -> project */}
            {groupedTimeline.identities.map((identity) => {
              const identityCollapsed = collapsedIdentities.has(identity.id)
              const identityCount = identity.projects.reduce((sum, project) => sum + project.tasks.length, 0)

              return (
                <div key={identity.id}>
                  <div className="flex border-b border-sky-100 bg-gradient-to-r from-sky-50/95 via-sky-50/75 to-white">
                    <button
                      type="button"
                      onClick={() => toggleIdentity(identity.id)}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                      style={{ width: LABEL_WIDTH + gridWidth }}
                    >
                      <ChevronDown className={`h-4 w-4 shrink-0 text-sky-500 transition-transform ${identityCollapsed ? '-rotate-90' : ''}`} />
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/90 shadow-sm ring-1 ring-sky-100">
                        <UserRound className="h-3.5 w-3.5 text-sky-600" />
                      </span>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">{identity.name}</span>
                      <span className="ml-auto rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-sky-600 ring-1 ring-sky-100">{identityCount} tasks</span>
                    </button>
                  </div>

                  {!identityCollapsed && identity.projects.map((project) => {
                    const projectCollapsed = collapsedProjects.has(project.id)
                    const projectSpan = getGroupSpan(project.tasks)
                    return (
                      <div key={project.id}>
                        <div className="flex border-b border-slate-200/80 bg-slate-50/65">
                          <button
                            type="button"
                            onClick={() => toggleProject(project.id)}
                            className="flex w-full text-left"
                            style={{ width: LABEL_WIDTH + gridWidth }}
                          >
                            <div
                              style={{ width: LABEL_WIDTH }}
                              className="flex shrink-0 items-center gap-2 border-r border-slate-200/80 px-4 py-2.5"
                            >
                              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${projectCollapsed ? '-rotate-90' : ''}`} />
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
                                <FolderOpen className="h-3.5 w-3.5 text-slate-600" />
                              </span>
                              <div className="min-w-0">
                                <div className="truncate text-xs font-semibold text-slate-800">{project.name}</div>
                                <div className="text-[10px] text-slate-400">{project.tasks.length} tasks in range</div>
                              </div>
                            </div>
                            <div className="relative flex items-center px-3 py-2" style={{ width: gridWidth }}>
                              {days.map((day) => (
                                <div
                                  key={`${project.id}-${day.toISOString()}`}
                                  style={{ width: COL_WIDTH }}
                                  className={`shrink-0 border-r ${
                                    day.toDateString() === today.toDateString()
                                      ? 'bg-brand-50/80'
                                      : day.getDay() === 0 || day.getDay() === 6
                                        ? 'bg-gray-50/40'
                                        : ''
                                  }`}
                                />
                              ))}
                              {projectSpan ? (
                                <div
                                  className="pointer-events-none absolute top-1/2 z-10 flex h-7 -translate-y-1/2 items-center rounded-full border border-sky-300/80 bg-gradient-to-r from-sky-500/15 via-blue-500/12 to-indigo-500/15 px-3 shadow-sm"
                                  style={{
                                    left: Math.max(projectSpan.left + 6, 6),
                                    width: Math.max(Math.min(projectSpan.width - 12, gridWidth - 12), 88),
                                  }}
                                >
                                  <span className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                                    {project.name}
                                  </span>
                                  <span className="ml-auto shrink-0 pl-3 text-[10px] text-sky-600/80">
                                    {formatShort(projectSpan.start)} - {formatShort(projectSpan.end)}
                                  </span>
                                </div>
                              ) : (
                                <div className="pointer-events-none absolute inset-y-0 left-3 right-3 flex items-center">
                                  <div className="rounded-full border border-dashed border-slate-200 bg-white/80 px-3 py-1 text-[10px] text-slate-400">
                                    No scheduled dates in this range
                                  </div>
                                </div>
                              )}
                            </div>
                          </button>
                        </div>

                        {!projectCollapsed && project.tasks.map((task: TimelineTask) => {
              const band = getPriorityBand(task.priorityScore || 0)
              const colors = BAND_COLORS[band] || BAND_COLORS.low
              const barStyle = getBarStyle(task, dragSnapshot, pendingSnapshot)
              const isDragging = dragSnapshot?.taskId === task.id
              const isHovered = hoveredTaskId === task.id
              const origStart = getTaskStart(task)
              const origEnd = getTaskEnd(task)
              const isCompleted = task.status === 'completed' || task.status === 'dismissed'

              return (
                <div
                  key={task.id}
                  className={`flex border-b transition-colors ${
                    isCompleted
                      ? 'bg-gray-50/70 opacity-70'
                      : dropTargetTaskId === task.id && draggedTaskId !== task.id
                        ? 'bg-brand-50/80'
                      : isDragging
                        ? 'bg-brand-50/50'
                        : 'hover:bg-gray-50/50'
                  }`}
                  style={{ height: ROW_HEIGHT }}
                  onDragOver={(e) => {
                    if (!draggedTaskId || draggedTaskId === task.id) return
                    if (!canReorderWithinSection(draggedTaskId, task.id)) {
                      setDropTargetTaskId(null)
                      return
                    }
                    e.preventDefault()
                    setDropTargetTaskId(task.id)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    const sourceId = e.dataTransfer.getData('text/timeline-order')
                    if (sourceId) {
                      if (!canReorderWithinSection(sourceId, task.id)) {
                        toast.warning('Reorder tasks only within the same project section')
                      } else {
                        reorderTasks(sourceId, task.id)
                        toast.success('Timeline order updated')
                      }
                    }
                    setDraggedTaskId(null)
                    setDropTargetTaskId(null)
                  }}
                >
                  {/* Label — two lines: title + due date */}
                  <div
                    style={{ width: LABEL_WIDTH }}
                    className={`shrink-0 border-r flex items-center px-3 gap-2 z-20 relative ${
                      isCompleted ? 'bg-gray-50/80' : 'bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/timeline-order', task.id)
                        setDraggedTaskId(task.id)
                      }}
                      onDragEnd={() => {
                        setDraggedTaskId(null)
                        setDropTargetTaskId(null)
                      }}
                      className={`shrink-0 rounded-md p-1 text-gray-300 transition-colors ${
                        isCompleted ? 'cursor-grab text-gray-300/80' : 'cursor-grab hover:bg-brand-50 hover:text-brand-500'
                      }`}
                      title="Drag to reorder tasks"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${colors.bar}`} />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/dashboard/tasks/${task.id}`}
                        className={`block text-xs font-medium leading-tight line-clamp-2 ${
                          isCompleted
                            ? 'text-gray-500 line-through'
                            : 'text-gray-800 hover:text-brand-600'
                        }`}
                        title={task.title}
                      >
                        {task.title}
                      </Link>
                      {origEnd && (
                        <span className="mt-0.5 block text-[9px] text-gray-400">
                          Due {formatShort(origEnd)}
                        </span>
                      )}
                      {task.matter?.title ? (
                        <span className="mt-0.5 block truncate text-[9px] text-slate-400">
                          {task.matter.title}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Grid + bar */}
                  <div className="relative flex overflow-hidden" style={{ width: gridWidth }}>
                    {/* Grid columns */}
                    {days.map((day) => (
                      <div
                        key={day.toISOString()}
                        style={{ width: COL_WIDTH }}
                        className={`shrink-0 border-r ${
                          day.toDateString() === today.toDateString() ? 'bg-brand-50' : (day.getDay() === 0 || day.getDay() === 6) ? 'bg-gray-50/50' : ''
                        }`}
                      />
                    ))}

                    {/* Today line */}
                    {todayOffset >= 0 && todayOffset < gridWidth && (
                      <div className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-brand-500 z-10" style={{ left: todayOffset + COL_WIDTH / 2 }} />
                    )}

                    {/* Task bar */}
                    {barStyle && origStart && origEnd && (
                      <div
                        className={`absolute rounded-md border shadow-sm cursor-grab active:cursor-grabbing ${
                          isCompleted
                            ? 'z-10 opacity-60'
                            : isDragging
                              ? 'shadow-lg ring-2 ring-blue-300 z-20'
                              : 'z-10 hover:shadow-md'
                        } ${colors.bar} ${colors.border}`}
                        style={{
                          left: barStyle.left,
                          width: Math.max(barStyle.width, COL_WIDTH * 0.5),
                          top: 8,
                          height: ROW_HEIGHT - 16,
                        }}
                        onMouseEnter={() => setHoveredTaskId(task.id)}
                        onMouseLeave={() => setHoveredTaskId(null)}
                        onMouseDown={(e) => startDrag(e, task.id, 'move', origStart, origEnd)}
                      >
                        {/* Bar label */}
                        <div className={`absolute inset-0 flex items-center truncate px-2.5 text-[10px] font-semibold leading-none pointer-events-none ${colors.text}`}>
                          {barStyle.width >= COL_WIDTH * 2.5 ? task.title : ''}
                        </div>

                        {/* Left resize handle */}
                        <div
                          className="absolute left-0 top-0 bottom-0 cursor-ew-resize rounded-l-md z-10 hover:bg-black/20"
                          style={{ width: HANDLE_WIDTH }}
                          onMouseDown={(e) => { e.stopPropagation(); startDrag(e, task.id, 'resize-left', origStart, origEnd) }}
                        >
                          <div className="absolute left-1 top-1/2 -translate-y-1/2 h-3 w-0.5 rounded bg-white/60" />
                        </div>

                        {/* Right resize handle */}
                        <div
                          className="absolute right-0 top-0 bottom-0 cursor-ew-resize rounded-r-md z-10 hover:bg-black/20"
                          style={{ width: HANDLE_WIDTH }}
                          onMouseDown={(e) => { e.stopPropagation(); startDrag(e, task.id, 'resize-right', origStart, origEnd) }}
                        >
                          <div className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-0.5 rounded bg-white/60" />
                        </div>

                        {/* Hover tooltip */}
                        {isHovered && !isDragging && (
                          <div
                            className="pointer-events-none absolute z-30 whitespace-nowrap rounded bg-gray-900 px-2.5 py-1.5 text-[10px] font-medium text-white shadow-lg"
                            style={{ left: Math.max(barStyle.width, COL_WIDTH * 0.5) + 6, top: '50%', transform: 'translateY(-50%)' }}
                          >
                            <div>{task.title}</div>
                            <div className="text-gray-400 text-[9px] mt-0.5">
                              {formatShort(barStyle.taskStart)} — {formatShort(barStyle.taskEnd)}
                            </div>
                            <div className="absolute right-full top-1/2 -translate-y-1/2 h-0 w-0 border-r-4 border-t-4 border-b-4 border-transparent border-r-gray-900" />
                          </div>
                        )}
                      </div>
                    )}

                    {!barStyle && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[10px] text-gray-400 italic">No dates</span>
                      </div>
                    )}
                  </div>
                </div>
              )
                        })}
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {groupedTimeline.ungrouped.length > 0 && (
              <div>
                <div className="flex border-b border-slate-200/80 bg-slate-50/75">
                  <div className="flex items-center gap-2 px-3 py-2.5" style={{ width: LABEL_WIDTH + gridWidth }}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
                      <FolderOpen className="h-3.5 w-3.5 text-slate-600" />
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">Uncategorized</span>
                    <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">{groupedTimeline.ungrouped.length} tasks</span>
                  </div>
                </div>
                {groupedTimeline.ungrouped.map((task: TimelineTask) => {
                  const band = getPriorityBand(task.priorityScore || 0)
                  const colors = BAND_COLORS[band] || BAND_COLORS.low
                  const barStyle = getBarStyle(task, dragSnapshot, pendingSnapshot)
                  const isDragging = dragSnapshot?.taskId === task.id
                  const isHovered = hoveredTaskId === task.id
                  const origStart = getTaskStart(task)
                  const origEnd = getTaskEnd(task)
                  const isCompleted = task.status === 'completed' || task.status === 'dismissed'

                  return (
                    <div
                      key={task.id}
                      className={`flex border-b transition-colors ${
                        isCompleted
                          ? 'bg-gray-50/70 opacity-70'
                          : dropTargetTaskId === task.id && draggedTaskId !== task.id
                            ? 'bg-brand-50/80'
                            : isDragging
                              ? 'bg-brand-50/50'
                              : 'hover:bg-gray-50/50'
                      }`}
                      style={{ height: ROW_HEIGHT }}
                      onDragOver={(e) => {
                        if (!draggedTaskId || draggedTaskId === task.id) return
                        if (!canReorderWithinSection(draggedTaskId, task.id)) {
                          setDropTargetTaskId(null)
                          return
                        }
                        e.preventDefault()
                        setDropTargetTaskId(task.id)
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        const sourceId = e.dataTransfer.getData('text/timeline-order')
                        if (sourceId) {
                          if (!canReorderWithinSection(sourceId, task.id)) {
                            toast.warning('Reorder tasks only within the same project section')
                          } else {
                            reorderTasks(sourceId, task.id)
                            toast.success('Timeline order updated')
                          }
                        }
                        setDraggedTaskId(null)
                        setDropTargetTaskId(null)
                      }}
                    >
                      <div
                        style={{ width: LABEL_WIDTH }}
                        className={`shrink-0 border-r flex items-center px-3 gap-2 z-20 relative ${
                          isCompleted ? 'bg-gray-50/80' : 'bg-white'
                        }`}
                      >
                        <button
                          type="button"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move'
                            e.dataTransfer.setData('text/timeline-order', task.id)
                            setDraggedTaskId(task.id)
                          }}
                          onDragEnd={() => {
                            setDraggedTaskId(null)
                            setDropTargetTaskId(null)
                          }}
                          className={`shrink-0 rounded-md p-1 text-gray-300 transition-colors ${
                            isCompleted ? 'cursor-grab text-gray-300/80' : 'cursor-grab hover:bg-brand-50 hover:text-brand-500'
                          }`}
                          title="Drag to reorder tasks"
                        >
                          <GripVertical className="h-4 w-4" />
                        </button>
                        <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${colors.bar}`} />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/dashboard/tasks/${task.id}`}
                            className={`block text-xs font-medium leading-tight line-clamp-2 ${
                              isCompleted ? 'text-gray-500 line-through' : 'text-gray-800 hover:text-brand-600'
                            }`}
                            title={task.title}
                          >
                            {task.title}
                          </Link>
                          {origEnd && (
                            <span className="mt-0.5 block text-[9px] text-gray-400">
                              Due {formatShort(origEnd)}
                            </span>
                          )}
                          {task.matter?.title ? (
                            <span className="mt-0.5 block truncate text-[9px] text-slate-400">
                              {task.matter.title}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="relative flex overflow-hidden" style={{ width: gridWidth }}>
                        {days.map((day) => (
                          <div
                            key={day.toISOString()}
                            style={{ width: COL_WIDTH }}
                            className={`shrink-0 border-r ${
                              day.toDateString() === today.toDateString() ? 'bg-brand-50' : (day.getDay() === 0 || day.getDay() === 6) ? 'bg-gray-50/50' : ''
                            }`}
                          />
                        ))}

                        {todayOffset >= 0 && todayOffset < gridWidth && (
                          <div className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-brand-500 z-10" style={{ left: todayOffset + COL_WIDTH / 2 }} />
                        )}

                        {barStyle && origStart && origEnd && (
                          <div
                            className={`absolute rounded-md border shadow-sm cursor-grab active:cursor-grabbing ${
                              isCompleted
                                ? 'z-10 opacity-60'
                                : isDragging
                                  ? 'shadow-lg ring-2 ring-blue-300 z-20'
                                  : 'z-10 hover:shadow-md'
                            } ${colors.bar} ${colors.border}`}
                            style={{
                              left: barStyle.left,
                              width: Math.max(barStyle.width, COL_WIDTH * 0.5),
                              top: 8,
                              height: ROW_HEIGHT - 16,
                            }}
                            onMouseEnter={() => setHoveredTaskId(task.id)}
                            onMouseLeave={() => setHoveredTaskId(null)}
                            onMouseDown={(e) => startDrag(e, task.id, 'move', origStart, origEnd)}
                          >
                            <div className={`absolute inset-0 flex items-center truncate px-2.5 text-[10px] font-semibold leading-none pointer-events-none ${colors.text}`}>
                              {barStyle.width >= COL_WIDTH * 2.5 ? task.title : ''}
                            </div>
                            <div
                              className="absolute left-0 top-0 bottom-0 cursor-ew-resize rounded-l-md z-10 hover:bg-black/20"
                              style={{ width: HANDLE_WIDTH }}
                              onMouseDown={(e) => { e.stopPropagation(); startDrag(e, task.id, 'resize-left', origStart, origEnd) }}
                            >
                              <div className="absolute left-1 top-1/2 -translate-y-1/2 h-3 w-0.5 rounded bg-white/60" />
                            </div>
                            <div
                              className="absolute right-0 top-0 bottom-0 cursor-ew-resize rounded-r-md z-10 hover:bg-black/20"
                              style={{ width: HANDLE_WIDTH }}
                              onMouseDown={(e) => { e.stopPropagation(); startDrag(e, task.id, 'resize-right', origStart, origEnd) }}
                            >
                              <div className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-0.5 rounded bg-white/60" />
                            </div>
                            {isHovered && !isDragging && (
                              <div
                                className="pointer-events-none absolute z-30 whitespace-nowrap rounded bg-gray-900 px-2.5 py-1.5 text-[10px] font-medium text-white shadow-lg"
                                style={{ left: Math.max(barStyle.width, COL_WIDTH * 0.5) + 6, top: '50%', transform: 'translateY(-50%)' }}
                              >
                                <div>{task.title}</div>
                                <div className="text-gray-400 text-[9px] mt-0.5">
                                  {formatShort(barStyle.taskStart)} â€” {formatShort(barStyle.taskEnd)}
                                </div>
                                <div className="absolute right-full top-1/2 -translate-y-1/2 h-0 w-0 border-r-4 border-t-4 border-b-4 border-transparent border-r-gray-900" />
                              </div>
                            )}
                          </div>
                        )}

                        {!barStyle && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[10px] text-gray-400 italic">No dates</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        )}
        </div>

        <div className="mt-3 flex items-center gap-4 text-[10px] text-gray-400">
          <span>Drag bar to move - Drag edges to resize - Hover for details</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-6 rounded bg-critical" /> Critical
            <span className="inline-block h-2.5 w-6 rounded bg-orange" /> High
            <span className="inline-block h-2.5 w-6 rounded bg-yellow" /> Medium
            <span className="inline-block h-2.5 w-6 rounded bg-gray-400" /> Low
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
