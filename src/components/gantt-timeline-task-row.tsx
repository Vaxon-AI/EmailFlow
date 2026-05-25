'use client'

import Link from 'next/link'
import { GripVertical } from 'lucide-react'
import { getPriorityBand } from '@/types'
import { toast } from 'sonner'
import {
  BAND_COLORS,
  COL_WIDTH,
  HANDLE_WIDTH,
  LABEL_WIDTH,
  ROW_HEIGHT,
  formatShort,
  getTaskEnd,
  getTaskStart,
  type BarStyle,
  type DragSnapshot,
  type PendingPosition,
  type TimelineTask,
} from './gantt-timeline-utils'

type DragMode = 'move' | 'resize-left' | 'resize-right'

type Props = {
  task: TimelineTask
  days: Date[]
  today: Date
  gridWidth: number
  todayOffset: number
  draggedTaskId: string | null
  dropTargetTaskId: string | null
  hoveredTaskId: string | null
  dragSnapshot: DragSnapshot | null
  pendingSnapshot: PendingPosition | null
  setDraggedTaskId: (id: string | null) => void
  setDropTargetTaskId: (id: string | null) => void
  setHoveredTaskId: (id: string | null) => void
  startDrag: (e: React.MouseEvent, taskId: string, mode: DragMode, origStart: Date, origEnd: Date) => void
  getBarStyle: (task: TimelineTask, drag: DragSnapshot | null, pending: PendingPosition | null) => BarStyle | null
  reorderTasks: (sourceId: string, targetId: string) => void
  canReorderWithinSection: (sourceId: string, targetId: string) => boolean
}

export function GanttTaskRow({
  task,
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
}: Props) {
  const band = getPriorityBand(task.priorityScore || 0)
  const colors = BAND_COLORS[band] || BAND_COLORS.low
  const barStyle = getBarStyle(task, dragSnapshot, pendingSnapshot)
  const isDragging = dragSnapshot?.taskId === task.id
  const isHovered = hoveredTaskId === task.id
  const origStart = getTaskStart(task)
  const origEnd = getTaskEnd(task)
  const isCompleted = task.status === 'completed'

  return (
    <div
      className={`flex border-b transition-colors ${
        isCompleted
          ? 'bg-slate-50/80 opacity-70'
          : dropTargetTaskId === task.id && draggedTaskId !== task.id
            ? 'bg-brand-50/80'
          : isDragging
            ? 'bg-brand-50/60'
            : 'hover:bg-brand-50/55'
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
          isCompleted ? 'bg-slate-50/90' : 'bg-white'
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
        <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${colors.dot}`} />
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
              day.toDateString() === today.toDateString() ? 'bg-brand-50/70' : (day.getDay() === 0 || day.getDay() === 6) ? 'bg-slate-50/80' : ''
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
                ? 'z-10 opacity-45 saturate-75'
                : isDragging
                  ? 'shadow-lg ring-2 ring-brand-300 z-20'
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
}
