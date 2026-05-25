'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Calendar,
  CheckSquare,
  ChevronRight,
  ExternalLink,
  FileText,
  FolderOpen,
  ListChecks,
  Plus,
  RotateCcw,
  Shield,
  Sparkles,
  Square,
  ThumbsUp,
  TrendingUp,
  UserRound,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InlineNotice } from '@/components/inline-notice'
import { PageHeader } from '@/components/page-header'
import { StatePanel } from '@/components/state-panel'
import { getPriorityBand, getPriorityColor, getPriorityLabel } from '@/types'
import { useDemoStore } from '@/lib/demo/store'
import { effectiveDeadline, type DemoTaskStatus } from '@/lib/demo/types'
import { cn } from '@/lib/utils'
import { TASK_STATUS_CONFIG } from '../../_components/demo-bits'

const DAY_MS = 86_400_000

function toDateInput(iso: string | null): string {
  return iso ? iso.split('T')[0] : ''
}

function scheduleDuration(start: string | null, due: string | null): string | null {
  if (!start || !due) return null
  const days = Math.round((new Date(due).getTime() - new Date(start).getTime()) / DAY_MS) + 1
  return days >= 1 ? `${days} day${days === 1 ? '' : 's'}` : null
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

export default function DemoTaskDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const store = useDemoStore()
  const task = store.getTask(params.id)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<number | null>(null)

  const deleteTask = () => {
    store.deleteTask(params.id)
    toast.success('Task deleted')
    router.push('/demo/tasks')
  }

  if (!task) {
    return (
      <div className="space-y-4">
        <Link
          href="/demo/tasks"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to tasks
        </Link>
        <StatePanel
          icon={<ListChecks className="h-5 w-5 text-gray-400" />}
          title="Task not found"
          description="This task isn't part of the demo workspace."
        />
      </div>
    )
  }

  const project = store.getProject(task.projectId)
  const identity = store.getIdentity(project?.identityId)
  const matter = store.getMatter(task.matterId)
  const linkedEmails = store.emailsForTask(task.id)
  const sts = TASK_STATUS_CONFIG[task.status]
  const StsIcon = sts.icon
  const band = getPriorityBand(task.priorityScore)
  const deadline = effectiveDeadline(task)
  const duration = scheduleDuration(task.startDate, deadline)
  const checkedCount = task.checkedActionItems.length

  const patch = (p: Parameters<typeof store.updateTask>[1]) => store.updateTask(task.id, p)
  const setStatus = (status: DemoTaskStatus, msg: string) => {
    store.setTaskStatus(task.id, status)
    toast.success(msg)
  }
  const setItems = (items: string[], cai: number[]) =>
    patch({ actionItems: items, checkedActionItems: cai })
  const addItem = () => {
    patch({ actionItems: [...task.actionItems, ''] })
    setEditingItem(task.actionItems.length)
  }
  const deleteItem = (i: number) =>
    setItems(
      task.actionItems.filter((_, idx) => idx !== i),
      task.checkedActionItems.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c)),
    )

  return (
    <div className="animate-in fade-in duration-200">
      <Link
        href="/demo/tasks"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to tasks
      </Link>

      <div className="mx-auto mt-2 max-w-6xl space-y-5">
        <PageHeader
          title={task.title}
          description="Review task details, refine the AI output, and keep linked source emails in sync."
          meta={`Created ${new Date(task.createdAt).toLocaleDateString('en', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })} · ${linkedEmails.length} linked email${linkedEmails.length === 1 ? '' : 's'}`}
        />

        {/* Identity / Project / Matter breadcrumb */}
        <div className="flex w-full items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-2.5">
          <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="text-xs font-medium text-slate-500">{identity?.name ?? 'Unassigned'}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="text-xs font-semibold text-slate-700">{project?.name ?? 'Uncategorized'}</span>
          {matter && (
            <>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
              <span className="text-xs text-slate-500">{matter.title}</span>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* LEFT */}
          <div className="space-y-4 lg:col-span-2">
            {/* Header card */}
            <Card className={cn('overflow-hidden border-white/70 bg-gradient-to-br shadow-sm', sts.headerBg)}>
              <CardContent className="space-y-4 py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={cn('gap-1', sts.badge)}>
                    <StsIcon className="h-3 w-3" />
                    {sts.label}
                  </Badge>
                  <Badge variant="outline" className={cn('gap-1', getPriorityColor(band))}>
                    <TrendingUp className="h-3 w-3" />
                    {getPriorityLabel(band)} — {task.priorityScore}
                  </Badge>
                  {deadline && (
                    <Badge variant="outline" className="gap-1 border-gray-200 bg-white/60 text-[10px] text-gray-600">
                      <Calendar className="h-3 w-3" />
                      Due{' '}
                      {new Date(deadline).toLocaleDateString('en', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </Badge>
                  )}
                </div>

                {task.status === 'ai_suggestion' && (
                  <InlineNotice variant="warning">
                    <div className="flex w-full items-center gap-3">
                      <span className="min-w-0 flex-1 text-left">
                        This AI suggestion is waiting for you before it becomes active work.
                      </span>
                      <div className="ml-auto flex shrink-0 items-center gap-2">
                        <Button
                          size="sm"
                          variant="brandSoft"
                          className="h-8 gap-1.5"
                          onClick={() => setStatus('active', 'Task moved to Active')}
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                          Activate
                        </Button>
                        <Button size="sm" variant="utility" className="h-8 gap-1.5" onClick={deleteTask}>
                          <X className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </InlineNotice>
                )}
                {task.status === 'completed' && (
                  <InlineNotice variant="success">
                    <div className="flex w-full items-center gap-3">
                      <span className="min-w-0 flex-1 text-left">
                        This task is marked complete. Reopen it if more work shows up.
                      </span>
                      <Button
                        size="sm"
                        variant="success"
                        className="ml-auto h-8 shrink-0 gap-1.5"
                        onClick={() => setStatus('active', 'Task reopened')}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reopen
                      </Button>
                    </div>
                  </InlineNotice>
                )}
                <div className="rounded-xl border bg-white/70 px-4 py-3 backdrop-blur-sm">
                  <p className="text-sm leading-relaxed text-gray-700">{task.summary || '—'}</p>
                  <p className="mt-2 text-[11px] text-gray-400">
                    Created{' '}
                    {new Date(task.createdAt).toLocaleDateString('en', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Task Info card */}
            <Card className={cn('border-white/70 bg-gradient-to-br shadow-sm', sts.headerBg)}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <FileText className="h-4 w-4" />
                  Task Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Title */}
                <Field label="Title">
                  {editingField === 'title' ? (
                    <input
                      autoFocus
                      value={task.title}
                      onChange={(e) => patch({ title: e.target.value })}
                      onBlur={() => setEditingField(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Escape') setEditingField(null)
                      }}
                      className="mt-1 w-full rounded-lg border border-brand-300 px-3 py-2 text-sm font-semibold outline-none ring-2 ring-brand-100"
                    />
                  ) : (
                    <Editable
                      onClick={() => setEditingField('title')}
                      className="text-sm font-semibold text-gray-900"
                    >
                      {task.title}
                    </Editable>
                  )}
                </Field>

                {/* Summary */}
                <Field label="Summary">
                  {editingField === 'summary' ? (
                    <textarea
                      autoFocus
                      value={task.summary}
                      rows={3}
                      onChange={(e) => patch({ summary: e.target.value })}
                      onBlur={() => setEditingField(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditingField(null)
                      }}
                      className="mt-1 w-full resize-none rounded-lg border border-brand-300 px-3 py-2 text-sm outline-none ring-2 ring-brand-100"
                    />
                  ) : (
                    <Editable
                      onClick={() => setEditingField('summary')}
                      className="text-sm leading-relaxed text-gray-700"
                    >
                      {task.summary || '—'}
                    </Editable>
                  )}
                </Field>

                {/* Schedule */}
                <Field label="Schedule">
                  {editingField === 'schedule' ? (
                    <div className="mt-1 grid grid-cols-2 gap-2" onBlur={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) setEditingField(null)
                    }}>
                      <div>
                        <p className="text-[11px] text-gray-400">Start date</p>
                        <input
                          autoFocus
                          type="date"
                          value={toDateInput(task.startDate)}
                          onChange={(e) =>
                            patch({
                              startDate: e.target.value
                                ? new Date(`${e.target.value}T09:00:00`).toISOString()
                                : null,
                            })
                          }
                          className="mt-1 h-9 w-full rounded-md border border-gray-200 px-2 text-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                        />
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400">Due date</p>
                        <input
                          type="date"
                          value={toDateInput(deadline)}
                          onChange={(e) =>
                            patch({
                              userSetDeadline: e.target.value
                                ? new Date(`${e.target.value}T17:00:00`).toISOString()
                                : null,
                              isUserEdited: true,
                            })
                          }
                          className="mt-1 h-9 w-full rounded-md border border-gray-200 px-2 text-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                        />
                      </div>
                    </div>
                  ) : (
                    <Editable
                      onClick={() => setEditingField('schedule')}
                      className="flex items-center gap-1.5 text-sm text-gray-700"
                    >
                      {task.startDate && deadline ? (
                        <>
                          <span>{shortDate(task.startDate)}</span>
                          <span className="text-gray-400">→</span>
                          <span>{shortDate(deadline)}</span>
                          {duration && (
                            <span className="ml-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                              {duration}
                            </span>
                          )}
                        </>
                      ) : deadline ? (
                        <span>Due {shortDate(deadline)}</span>
                      ) : task.startDate ? (
                        <span>From {shortDate(task.startDate)}</span>
                      ) : (
                        <span className="font-medium">—</span>
                      )}
                    </Editable>
                  )}
                </Field>

                {/* Urgency / Impact */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Urgency">
                    {editingField === 'urgency' ? (
                      <input
                        autoFocus
                        type="number"
                        min={1}
                        max={5}
                        value={task.urgency}
                        onChange={(e) => {
                          const u = Math.min(5, Math.max(1, Number(e.target.value) || 1))
                          patch({ urgency: u, priorityScore: u * task.impact })
                        }}
                        onBlur={() => setEditingField(null)}
                        className="mt-1 w-full rounded-lg border border-brand-300 px-3 py-2 text-sm outline-none ring-2 ring-brand-100"
                      />
                    ) : (
                      <Editable
                        onClick={() => setEditingField('urgency')}
                        className="text-sm font-medium text-gray-700"
                      >
                        {task.urgency} / 5
                      </Editable>
                    )}
                  </Field>
                  <Field label="Impact">
                    {editingField === 'impact' ? (
                      <input
                        autoFocus
                        type="number"
                        min={1}
                        max={5}
                        value={task.impact}
                        onChange={(e) => {
                          const im = Math.min(5, Math.max(1, Number(e.target.value) || 1))
                          patch({ impact: im, priorityScore: task.urgency * im })
                        }}
                        onBlur={() => setEditingField(null)}
                        className="mt-1 w-full rounded-lg border border-brand-300 px-3 py-2 text-sm outline-none ring-2 ring-brand-100"
                      />
                    ) : (
                      <Editable
                        onClick={() => setEditingField('impact')}
                        className="text-sm font-medium text-gray-700"
                      >
                        {task.impact} / 5
                      </Editable>
                    )}
                  </Field>
                </div>

                {/* Notes */}
                <Field label="Your Notes">
                  {editingField === 'notes' ? (
                    <textarea
                      autoFocus
                      value={task.userNotes ?? ''}
                      rows={2}
                      placeholder="Add a private note…"
                      onChange={(e) => patch({ userNotes: e.target.value || null })}
                      onBlur={() => setEditingField(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditingField(null)
                      }}
                      className="mt-1 w-full resize-none rounded-lg border border-brand-300 px-3 py-2 text-sm outline-none ring-2 ring-brand-100"
                    />
                  ) : (
                    <Editable
                      onClick={() => setEditingField('notes')}
                      className="text-sm text-gray-700"
                    >
                      {task.userNotes || '—'}
                    </Editable>
                  )}
                </Field>

                {/* Status */}
                <Field label="Status">
                  <select
                    value={task.status}
                    onChange={(e) => {
                      const next = e.target.value as DemoTaskStatus
                      setStatus(next, `Status changed to ${TASK_STATUS_CONFIG[next].label}`)
                    }}
                    className="mt-1.5 h-9 w-48 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700 shadow-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                  >
                    <option value="ai_suggestion">AI Suggestion</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                  </select>
                </Field>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT */}
          <div className="space-y-4">
            {/* AI Analysis */}
            {task.source === 'email' && (
              <Card className="border-warning-100 bg-gradient-to-br from-yellow-50/50 to-white shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Sparkles className="h-4 w-4 text-warning" />
                    AI Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs leading-relaxed text-yellow-800">{task.priorityReason}</p>
                </CardContent>
              </Card>
            )}

            {/* Checklist */}
            <Card className="border-white/70 bg-white/95 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <ListChecks className="h-4 w-4 text-brand-500" />
                    Checklist
                    <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">
                      {checkedCount}/{task.actionItems.length}
                    </span>
                  </CardTitle>
                  <button
                    type="button"
                    onClick={addItem}
                    className="shrink-0 rounded-full p-1 text-brand-600 transition-colors hover:bg-brand-100 hover:text-brand-700"
                    title="Add item"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {task.actionItems.length === 0 ? (
                  <button
                    type="button"
                    onClick={addItem}
                    className="flex w-full items-center gap-2 rounded-lg border border-dashed border-brand-200 bg-brand-50/40 px-3 py-3 text-left text-xs text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    Add the first checklist item
                  </button>
                ) : (
                  <>
                    {task.actionItems.length > 1 && (
                      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-brand-500 transition-all duration-300"
                          style={{ width: `${(checkedCount / task.actionItems.length) * 100}%` }}
                        />
                      </div>
                    )}
                    <ul className="space-y-1">
                      {task.actionItems.map((item, index) => {
                        const checked = task.checkedActionItems.includes(index)
                        return (
                          <li
                            key={index}
                            className="group flex items-center gap-2 rounded-lg transition-colors hover:bg-gray-50"
                          >
                            <button
                              type="button"
                              onClick={() => store.toggleActionItem(task.id, index)}
                              className="shrink-0 rounded p-1"
                            >
                              {checked ? (
                                <CheckSquare className="h-4 w-4 text-brand-500" />
                              ) : (
                                <Square className="h-4 w-4 text-gray-300 group-hover:text-brand-400" />
                              )}
                            </button>
                            <div className="min-w-0 flex-1">
                              {editingItem === index ? (
                                <input
                                  autoFocus
                                  value={item}
                                  onChange={(e) =>
                                    patch({
                                      actionItems: task.actionItems.map((t, i) =>
                                        i === index ? e.target.value : t,
                                      ),
                                    })
                                  }
                                  onBlur={() => setEditingItem(null)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === 'Escape') setEditingItem(null)
                                  }}
                                  className="w-full rounded border border-brand-200 bg-brand-50 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-brand-200"
                                />
                              ) : (
                                <span
                                  onClick={() => setEditingItem(index)}
                                  className={cn(
                                    '-mx-1 block cursor-text rounded px-1 py-1.5 text-sm transition-colors hover:bg-gray-100',
                                    checked ? 'text-gray-400 line-through' : 'text-gray-700',
                                  )}
                                >
                                  {item || '(empty)'}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => deleteItem(index)}
                              className="shrink-0 rounded p-1 text-gray-300 opacity-0 transition-all hover:bg-critical-50 hover:text-critical group-hover:opacity-100"
                              title="Delete"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Source emails */}
            <Card className="border-white/70 bg-white/95 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ListChecks className="h-4 w-4 text-brand-600" />
                  Source Emails
                  <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">
                    {linkedEmails.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {linkedEmails.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-3 py-3 text-xs text-slate-500">
                    No source email linked.
                  </div>
                ) : (
                  linkedEmails.map(({ email }) => {
                    const initial = (email.senderName || 'U')[0].toUpperCase()
                    return (
                      <Link
                        key={email.id}
                        href={`/demo/emails/${email.id}`}
                        className="group flex items-center gap-3 rounded-lg border p-3 transition-all hover:border-brand-200 hover:bg-brand-50/50"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                          {initial}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900 transition-colors group-hover:text-brand-600">
                            {email.subject}
                          </p>
                          <p className="truncate text-xs text-gray-500">{email.senderName}</p>
                        </div>
                        <ExternalLink className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-brand-400" />
                      </Link>
                    )
                  })
                )}
              </CardContent>
            </Card>

            {/* Details */}
            <Card className="border-white/70 bg-white/95 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Shield className="h-4 w-4 text-gray-400" />
                  Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2 text-xs">
                  <Detail label="Status" value={sts.label} />
                  <Detail label="Priority" value={`${getPriorityLabel(band)} (${task.priorityScore})`} />
                  <Detail label="Urgency" value={`${task.urgency} / 5`} />
                  <Detail label="Impact" value={`${task.impact} / 5`} />
                  {task.startDate && (
                    <Detail label="Start" value={new Date(task.startDate).toLocaleDateString('en-US')} />
                  )}
                  {deadline && <Detail label="Due" value={new Date(deadline).toLocaleDateString('en-US')} />}
                  {duration && <Detail label="Duration" value={duration} />}
                  <Detail label="Created" value={new Date(task.createdAt).toLocaleDateString('en-US')} />
                  <Detail label="Source" value={task.source === 'email' ? 'From an email' : 'Created manually'} />
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      {children}
    </div>
  )
}

function Editable({
  onClick,
  className,
  children,
}: {
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <p
      onClick={onClick}
      className={cn(
        '-mx-2 mt-1 cursor-text rounded px-2 py-1.5 transition-colors hover:bg-gray-50',
        className,
      )}
    >
      {children}
    </p>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-700">{value}</dd>
    </div>
  )
}
