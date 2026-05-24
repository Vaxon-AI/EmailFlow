'use client'

import Link from 'next/link'
import { CheckSquare, CheckCircle2, Paperclip } from 'lucide-react'
import { useDemoStore } from '@/lib/demo/store'
import type { DemoEmail } from '@/lib/demo/types'
import { cn } from '@/lib/utils'
import { ClassChip, displayStateOf, formatEmailDate } from './demo-bits'

export function DemoEmailRow({
  email,
  isSelected,
  onToggleSelect,
}: {
  email: DemoEmail
  isSelected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const { getMatter, tasksForEmail } = useDemoStore()
  const matter = getMatter(email.matterId)
  const linkedTasks = tasksForEmail(email.id)
  const state = displayStateOf(email)
  const selectable = !!onToggleSelect

  const accentBar =
    state === 'needs_action'
      ? 'border-l-2 border-l-critical'
      : state === 'uncertain'
        ? 'border-l-2 border-l-warning'
        : ''

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-xl border border-gray-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:border-brand-200 hover:bg-brand-50/60 hover:shadow-sm',
        isSelected && 'border-brand-300 bg-brand-50/50',
        accentBar,
      )}
    >
      {selectable && (
        <input
          type="checkbox"
          checked={!!isSelected}
          onChange={(e) => {
            e.stopPropagation()
            onToggleSelect?.(email.id)
          }}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${email.subject}`}
          className={cn(
            'h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-brand-600 transition-opacity',
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        />
      )}
      <Link href={`/demo/emails/${email.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        {(state === 'needs_action' || state === 'uncertain' || state === 'unclassified') && (
          <ClassChip state={state} className="w-[104px] justify-center" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-gray-900">{email.subject}</p>
            {email.hasAttachments && <Paperclip className="h-3 w-3 shrink-0 text-gray-400" />}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <p className="truncate text-xs text-gray-500">{email.senderName}</p>
            {matter ? (
              <>
                <span className="text-[10px] text-gray-300">·</span>
                <span className="truncate text-[11px] text-gray-400">{matter.title}</span>
              </>
            ) : null}
          </div>
        </div>
        <span className="shrink-0 text-xs text-gray-400">{formatEmailDate(email.receivedAt)}</span>
      </Link>

      {linkedTasks.length > 0 && (
        <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
          {linkedTasks.map((task) => (
            <Link
              key={task.id}
              href={`/demo/tasks/${task.id}`}
              className={cn(
                'inline-flex max-w-[150px] items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors',
                task.status === 'completed'
                  ? 'border-success-100 bg-success-50/70 text-success hover:bg-success-100/70'
                  : 'border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100',
              )}
              title={task.title}
            >
              {task.status === 'completed' ? (
                <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
              ) : (
                <CheckSquare className="h-2.5 w-2.5 shrink-0" />
              )}
              <span className="truncate">{task.title}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
