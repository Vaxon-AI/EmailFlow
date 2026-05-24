'use client'

import Link from 'next/link'
import { Check, Mail, ThumbsUp, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { TaskDueBadge } from '@/components/task-due-badge'
import { getPriorityBand } from '@/types'
import { useDemoStore } from '@/lib/demo/store'
import { effectiveDeadline, type DemoTask } from '@/lib/demo/types'
import { cn } from '@/lib/utils'
import { PriorityBadge, StatusChip } from './demo-bits'

export function DemoTaskRow({
  task,
  isSelected,
  onToggleSelect,
}: {
  task: DemoTask
  isSelected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const { setTaskStatus, deleteTask, getMatter, emailsForTask } = useDemoStore()
  const band = getPriorityBand(task.priorityScore)
  const deadlineIso = effectiveDeadline(task)
  const matter = getMatter(task.matterId)
  const sourceEmail = emailsForTask(task.id)[0]?.email
  const isPending = task.status === 'ai_suggestion'
  const isDone = task.status === 'completed'
  const selectable = !!onToggleSelect

  const handleDelete = () => {
    deleteTask(task.id)
    toast.success('Task deleted', {
      description: 'Refresh the demo to restore the seed data.',
    })
  }

  const deleteBtnClass =
    'flex items-center gap-1 rounded-md border border-critical/30 bg-white px-2.5 py-1.5 text-xs font-medium text-critical shadow-sm transition-all hover:-translate-y-px hover:bg-critical-50 hover:shadow-md'

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-xl border px-3 transition-all',
        isSelected
          ? 'border-brand-300 bg-brand-50/50 py-3.5'
          : isPending
            ? 'border-brand-200 bg-brand-50/30 py-3.5 hover:border-brand-300 hover:shadow-md'
            : isDone
              ? 'border-gray-100 bg-gray-50/50 py-2.5 opacity-60 hover:opacity-90'
              : 'border-gray-200/80 bg-white py-3.5 hover:border-brand-200 hover:bg-brand-50/60 hover:shadow-sm',
      )}
    >
      {selectable && (
        <input
          type="checkbox"
          checked={!!isSelected}
          onChange={(e) => {
            e.stopPropagation()
            onToggleSelect?.(task.id)
          }}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${task.title}`}
          className={cn(
            'h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-brand-600 transition-opacity',
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        />
      )}

      {band === 'low' ? (
        <div className="w-1 shrink-0" />
      ) : (
        <div
          className={cn(
            'h-9 w-1 shrink-0 rounded-full',
            band === 'critical' ? 'bg-critical' : band === 'high' ? 'bg-orange' : 'bg-yellow',
          )}
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/demo/tasks/${task.id}`}
            className={cn(
              'truncate text-sm font-semibold transition-colors hover:text-brand-600',
              isDone ? 'text-gray-400 line-through' : 'text-gray-900',
            )}
          >
            {task.title}
          </Link>
          <PriorityBadge score={task.priorityScore} />
          <StatusChip status={task.status} />
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-500">{task.summary}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
          {matter ? <span className="truncate text-gray-500">{matter.title}</span> : null}
          {sourceEmail ? (
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {sourceEmail.senderName}
            </span>
          ) : null}
          <span>Score: {task.priorityScore}</span>
          <TaskDueBadge deadline={deadlineIso} muted={isDone} className="shrink-0" />
        </div>
      </div>

      <div
        className={cn(
          'flex items-center gap-1 transition-opacity',
          isPending ? '' : 'opacity-0 group-hover:opacity-100',
        )}
      >
        {isPending && (
          <>
            <button
              type="button"
              onClick={() => {
                setTaskStatus(task.id, 'active')
                toast.success('Task moved to Active')
              }}
              className="flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50/80 px-2.5 py-1.5 text-xs font-medium text-brand-700 shadow-sm transition-all hover:-translate-y-px hover:bg-brand-100/80 hover:shadow-md"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              Activate
            </button>
            <button type="button" onClick={handleDelete} className={deleteBtnClass}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </>
        )}
        {task.status === 'active' && (
          <>
            <button
              type="button"
              onClick={() => {
                setTaskStatus(task.id, 'completed')
                toast.success('Task completed', {
                  action: { label: 'Undo', onClick: () => setTaskStatus(task.id, 'active') },
                })
              }}
              className="flex items-center gap-1 rounded-md border border-success/20 bg-success/10 px-2.5 py-1.5 text-xs font-medium text-success shadow-sm transition-all hover:-translate-y-px hover:bg-success/15 hover:shadow-md"
            >
              <Check className="h-3.5 w-3.5" />
              Done
            </button>
            <button type="button" onClick={handleDelete} className={deleteBtnClass}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </>
        )}
        {isDone && (
          <button
            type="button"
            onClick={() => {
              setTaskStatus(task.id, 'active')
              toast.success('Task reopened')
            }}
            className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-500 shadow-sm transition-all hover:-translate-y-px hover:bg-gray-50 hover:shadow-md"
          >
            Reopen
          </button>
        )}
      </div>
    </div>
  )
}
