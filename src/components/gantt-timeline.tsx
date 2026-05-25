'use client'

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { MonthYearPanel } from '@/components/month-year-panel'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ChevronDown, ChevronLeft, ChevronRight, FolderOpen, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'
import {
  COL_WIDTH,
  LABEL_WIDTH,
  TIMELINE_ORDER_STORAGE_KEY,
  addDays,
  diffDays,
  formatShort,
  getTaskEnd,
  getTaskStart,
  intersectsRange,
  startOfDay,
  startOfWeek,
  toDateStr,
  type BarStyle,
  type DragSnapshot,
  type DragState,
  type PendingPosition,
  type TimelineTask,
  type UpdateTaskMutation,
} from './gantt-timeline-utils'
import { GanttTaskRow } from './gantt-timeline-task-row'

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
      const active = items.filter((task) => task.status !== 'completed')
      const done = items.filter((task) => task.status === 'completed')
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
    (task: TimelineTask, activeDrag: DragSnapshot | null, activePending: PendingPosition | null): BarStyle | null => {
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

    const sourceDone = sourceTask.status === 'completed'
    const targetDone = targetTask.status === 'completed'
    if (sourceDone !== targetDone) return false

    return true
  }, [visibleTaskLookup])

  const rowProps = {
    days,
    today,
    gridWidth,
    todayOffset,
    draggedTaskId,
    dropTargetTaskId,
    hoveredTaskId,
    dragSnapshot,
    pendingSnapshot,
    setDraggedTaskId,
    setDropTargetTaskId,
    setHoveredTaskId,
    startDrag,
    getBarStyle,
    reorderTasks,
    canReorderWithinSection,
  }

  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardContent className="min-w-0 overflow-hidden p-0">
        {/* Controls */}
        <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm">
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
                              ? 'border-brand-300 bg-brand-100 text-brand-700'
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
        <div className="max-w-full overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div style={{ minWidth: LABEL_WIDTH + gridWidth }} className="select-none">
            {/* Day headers */}
            <div className="flex border-b border-slate-200 bg-slate-50/80" style={{ height: 40 }}>
              <div style={{ width: LABEL_WIDTH }} className="shrink-0 border-r border-slate-200 px-3 text-xs font-semibold text-slate-500 flex items-end pb-1">
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
                        isToday ? 'bg-brand-50 font-bold text-brand-700' : isWeekend ? 'bg-slate-100/75 text-slate-500' : 'text-slate-600'
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
                  <div className="flex border-b border-slate-100 bg-white transition-colors hover:bg-slate-50">
                    <button
                      type="button"
                      onClick={() => toggleIdentity(identity.id)}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                      style={{ width: LABEL_WIDTH + gridWidth }}
                    >
                      <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${identityCollapsed ? '-rotate-90' : ''}`} />
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-50 shadow-sm ring-1 ring-slate-200">
                        <UserRound className="h-3.5 w-3.5 text-slate-500" />
                      </span>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{identity.name}</span>
                      <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{identityCount} tasks</span>
                    </button>
                  </div>

                  {!identityCollapsed && identity.projects.map((project) => {
                    const projectCollapsed = collapsedProjects.has(project.id)
                    const projectSpan = getGroupSpan(project.tasks)
                    return (
                      <div key={project.id}>
                        <div className="flex border-b border-slate-100 bg-slate-50/70 transition-colors hover:bg-slate-50">
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
                                      ? 'bg-brand-50/70'
                                      : day.getDay() === 0 || day.getDay() === 6
                                        ? 'bg-slate-100/55'
                                        : ''
                                  }`}
                                />
                              ))}
                              {projectSpan ? (
                                <div
                                  className="pointer-events-none absolute top-1/2 z-10 flex h-7 -translate-y-1/2 items-center rounded-full border border-brand-200 bg-white/95 px-3 shadow-sm"
                                  style={{
                                    left: Math.max(projectSpan.left + 6, 6),
                                    width: Math.max(Math.min(projectSpan.width - 12, gridWidth - 12), 88),
                                  }}
                                >
                                  <span className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-700">
                                    {project.name}
                                  </span>
                                  <span className="ml-auto shrink-0 pl-3 text-[10px] text-brand-600/80">
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

                        {!projectCollapsed && project.tasks.map((task: TimelineTask) => (
                          <GanttTaskRow key={task.id} task={task} {...rowProps} />
                        ))}
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {groupedTimeline.ungrouped.length > 0 && (
              <div>
                <div className="flex border-b border-slate-100 bg-white transition-colors hover:bg-slate-50">
                  <div className="flex items-center gap-2 px-3 py-2.5" style={{ width: LABEL_WIDTH + gridWidth }}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
                      <FolderOpen className="h-3.5 w-3.5 text-slate-600" />
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">Uncategorized</span>
                    <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">{groupedTimeline.ungrouped.length} tasks</span>
                  </div>
                </div>
                {groupedTimeline.ungrouped.map((task: TimelineTask) => (
                  <GanttTaskRow key={task.id} task={task} {...rowProps} />
                ))}
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
