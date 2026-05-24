'use client'

import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { Check, ChevronDown, FolderOpen, Mail, ThumbsUp, Trash2, UserRound } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { InlineEditableName } from '@/components/inline-editable-name'
import { StatePanel } from '@/components/state-panel'
import { TaskDueBadge } from '@/components/task-due-badge'
import { getPriorityBand, getPriorityColor, getPriorityLabel, getTaskStatusLabel } from '@/types'
import { toast } from 'sonner'
import type { MutationLike, TaskItem } from './task-page-types'

export function TaskListView({
  tasks,
  updateTask,
  focusProjectId,
  onReassign,
  onDelete,
  selectedIds,
  onToggleSelect,
  onBulkToggle,
}: {
  tasks: TaskItem[]
  updateTask: MutationLike
  focusProjectId?: string
  onReassign: (task: TaskItem) => void
  onDelete: (id: string) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onBulkToggle: (ids: string[], select: boolean) => void
}) {
  type ProjectGroup = { id: string; name: string; items: TaskItem[] }
  type IdentityGroup = { id: string; name: string; projects: ProjectGroup[] }

  const queryClient = useQueryClient()
  const [collapsedIdentities, setCollapsedIdentities] = useState<Set<string>>(new Set())
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())
  const [userHasToggled, setUserHasToggled] = useState(false)

  const renameProject = async (projectId: string, name: string) => {
    await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
  }

  const renameIdentity = async (identityId: string, name: string) => {
    await fetch(`/api/identities/${identityId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['identities'] })
  }

  const toggleIdentity = (id: string) => {
    setUserHasToggled(true)
    setCollapsedIdentities((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleProject = (id: string) => {
    setUserHasToggled(true)
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const sortItemsWithinGroup = useCallback((items: TaskItem[]) => {
    const active = items.filter((task) => task.status !== 'completed')
    const done = items.filter((task) => task.status === 'completed')
    return [...active, ...done]
  }, [])

  const { identityGroups, ungrouped } = useMemo(() => {
    const ungrouped: TaskItem[] = []
    const identityMap = new Map<string, { name: string; projectMap: Map<string, { name: string; items: TaskItem[] }> }>()

    for (const task of tasks) {
      if (!task.project) {
        ungrouped.push(task)
        continue
      }
      const identityId = task.project.identity?.id || '__unassigned__'
      const identityName = task.project.identity?.name || 'Unassigned'
      const projectId = task.project.id
      const projectName = task.project.name
      if (!identityMap.has(identityId)) identityMap.set(identityId, { name: identityName, projectMap: new Map() })
      const identity = identityMap.get(identityId)!
      if (!identity.projectMap.has(projectId)) identity.projectMap.set(projectId, { name: projectName, items: [] })
      identity.projectMap.get(projectId)!.items.push(task)
    }

    const latestScore = (items: TaskItem[]) => Math.max(...items.map((task) => task.priorityScore ?? 0))

    const identityGroups: IdentityGroup[] = Array.from(identityMap.entries())
      .map(([id, { name, projectMap }]) => {
        const projects = Array.from(projectMap.entries())
          .map(([projectId, { name: projectName, items }]) => ({
            id: projectId,
            name: projectName,
            items: sortItemsWithinGroup(items),
          }))
          .sort((a, b) => latestScore(b.items) - latestScore(a.items))
        return { id, name, projects }
      })
      .sort((a, b) => latestScore(b.projects.flatMap((project) => project.items)) - latestScore(a.projects.flatMap((project) => project.items)))

    return { identityGroups, ungrouped: sortItemsWithinGroup(ungrouped) }
  }, [sortItemsWithinGroup, tasks])

  if (tasks.length === 0) {
    return (
      <StatePanel
        icon={<FolderOpen className="h-5 w-5 text-gray-400" />}
        title="No tasks found"
        description="Try a different filter or create a task manually."
      />
    )
  }

  const ungroupedIds = ungrouped.map((task) => task.id)
  const allUngroupedSelected = ungroupedIds.length > 0 && ungroupedIds.every((id) => selectedIds.has(id))
  const someUngroupedSelected = ungroupedIds.some((id) => selectedIds.has(id))

  return (
    <div className="space-y-3">
      {identityGroups.map((identity) => {
        const isIdentityCollapsed = !userHasToggled && focusProjectId
          ? !identity.projects.some((project) => project.id === focusProjectId)
          : collapsedIdentities.has(identity.id)
        const totalCount = identity.projects.reduce((sum, project) => sum + project.items.length, 0)
        const identityTaskIds = identity.projects.flatMap((project) => project.items.map((task) => task.id))
        const allIdentitySelected = identityTaskIds.length > 0 && identityTaskIds.every((id) => selectedIds.has(id))
        const someIdentitySelected = identityTaskIds.some((id) => selectedIds.has(id))

        return (
          <div key={identity.id} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="group flex w-full items-center gap-2.5 px-4 py-3 transition-colors hover:bg-slate-50/70">
              <input
                type="checkbox"
                checked={allIdentitySelected}
                ref={(el) => { if (el) el.indeterminate = someIdentitySelected && !allIdentitySelected }}
                onChange={() => onBulkToggle(identityTaskIds, !allIdentitySelected)}
                onClick={(e) => e.stopPropagation()}
                className={`h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-brand-600 transition-opacity ${allIdentitySelected || someIdentitySelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
              />
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleIdentity(identity.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggleIdentity(identity.id)
                  }
                }}
                className="flex flex-1 cursor-pointer items-center gap-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 ${isIdentityCollapsed ? '-rotate-90' : ''}`} />
                <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                {identity.id === '__unassigned__'
                  ? <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">{identity.name}</span>
                  : <InlineEditableName name={identity.name} className="text-xs font-semibold uppercase tracking-widest text-slate-500" onSave={(name) => renameIdentity(identity.id, name)} />
                }
                <span className="ml-auto text-xs text-slate-400">{totalCount} task{totalCount !== 1 ? 's' : ''} shown</span>
              </div>
            </div>

            {!isIdentityCollapsed && (
              <div className="animate-soft-enter divide-y divide-slate-100 border-t border-slate-100">
                {identity.projects.map((project) => {
                  const isProjectCollapsed = !userHasToggled && focusProjectId
                    ? project.id !== focusProjectId
                    : collapsedProjects.has(project.id)
                  const projectTaskIds = project.items.map((task) => task.id)
                  const allProjectSelected = projectTaskIds.length > 0 && projectTaskIds.every((id) => selectedIds.has(id))
                  const someProjectSelected = projectTaskIds.some((id) => selectedIds.has(id))

                  return (
                    <div key={project.id}>
                      <div className="group flex w-full items-center gap-2.5 px-5 py-2.5 transition-colors hover:bg-slate-50/70">
                        <input
                          type="checkbox"
                          checked={allProjectSelected}
                          ref={(el) => { if (el) el.indeterminate = someProjectSelected && !allProjectSelected }}
                          onChange={() => onBulkToggle(projectTaskIds, !allProjectSelected)}
                          onClick={(e) => e.stopPropagation()}
                          className={`h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-brand-600 transition-opacity ${allProjectSelected || someProjectSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        />
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleProject(project.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              toggleProject(project.id)
                            }
                          }}
                          className="flex flex-1 cursor-pointer items-center gap-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform duration-150 ${isProjectCollapsed ? '-rotate-90' : ''}`} />
                          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <InlineEditableName name={project.name} className="text-sm font-medium text-slate-700" onSave={(name) => renameProject(project.id, name)} />
                          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{project.items.length}</span>
                        </div>
                      </div>

                      {!isProjectCollapsed && (
                        <div className="animate-soft-enter space-y-2 px-4 pb-3 pt-1">
                          {project.items.map((task) => (
                            <TaskRow
                              key={task.id}
                              task={task}
                              updateTask={updateTask}
                              onReassign={onReassign}
                              onDelete={onDelete}
                              isSelected={selectedIds.has(task.id)}
                              onToggleSelect={onToggleSelect}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {ungrouped.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="group flex items-center gap-2.5 px-4 py-3">
            <input
              type="checkbox"
              checked={allUngroupedSelected}
              ref={(el) => { if (el) el.indeterminate = someUngroupedSelected && !allUngroupedSelected }}
              onChange={() => onBulkToggle(ungroupedIds, !allUngroupedSelected)}
              className={`h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-brand-600 transition-opacity ${allUngroupedSelected || someUngroupedSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            />
            <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Uncategorized</span>
            <span className="ml-auto text-xs text-slate-400">{ungrouped.length} task{ungrouped.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-2 border-t border-slate-100 px-4 pb-3 pt-2">
            {ungrouped.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                updateTask={updateTask}
                onReassign={onReassign}
                onDelete={onDelete}
                isSelected={selectedIds.has(task.id)}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TaskRow({
  task,
  updateTask,
  onReassign,
  onDelete,
  isSelected,
  onToggleSelect,
}: {
  task: TaskItem
  updateTask: MutationLike
  onReassign: (task: TaskItem) => void
  onDelete: (id: string) => void
  isSelected: boolean
  onToggleSelect: (id: string) => void
}) {
  const band = getPriorityBand(task.priorityScore || 0)
  const deadline = task.userSetDeadline || task.explicitDeadline || task.inferredDeadline
  const startDate = task.startDate
  const senderName = task.emailLinks?.[0]?.email?.sender?.split('<')[0]?.trim()
  const isPending = task.status === 'ai_suggestion'
  const isDone = task.status === 'completed'
  const matter = task.matter ?? null

  return (
    <div
      className={`group flex items-center gap-3 rounded-xl border px-3 transition-all ${
        isSelected
          ? 'border-brand-300 bg-brand-50/50 py-3.5'
          : isPending
            ? 'border-brand-200 bg-brand-50/30 py-3.5 hover:border-brand-300 hover:shadow-md'
            : isDone
              ? 'border-gray-100 bg-gray-50/50 py-2.5 opacity-60 hover:opacity-80'
              : 'border-gray-200/80 bg-white py-3.5 hover:border-brand-200 hover:bg-brand-50/60 hover:shadow-sm'
      }`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => { e.stopPropagation(); onToggleSelect(task.id) }}
        onClick={(e) => e.stopPropagation()}
        className={`h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-brand-600 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      />

      {band === 'low' ? (
        <div className="w-1 shrink-0" />
      ) : (
        <div className={`h-9 w-1 shrink-0 rounded-full ${
          band === 'critical' ? 'bg-critical' :
          band === 'high' ? 'bg-orange' :
            'bg-yellow'
        }`}
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/tasks/${task.id}`}
            className={`truncate text-sm font-semibold transition-colors hover:text-brand-600 ${isDone ? 'text-gray-400 line-through' : 'text-gray-900'}`}
          >
            {task.title}
          </Link>
          <Badge variant="outline" className={`shrink-0 text-[10px] ${getPriorityColor(band)}`}>
            {getPriorityLabel(band)}
          </Badge>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            task.status === 'completed' ? 'bg-success-100 text-success' :
            task.status === 'active' ? 'bg-brand-100 text-brand-700' :
              'bg-ai-100 text-ai-700'
          }`}
          >
            {getTaskStatusLabel(task.status)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-500">{task.summary}</p>
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-gray-400">
          {matter ? <span className="truncate text-gray-500">{matter.title}</span> : null}
          {senderName && (
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {senderName}
            </span>
          )}
          <span>Score: {task.priorityScore}</span>
          <TaskDueBadge
            deadline={deadline}
            startDate={startDate}
            muted={isDone}
            className="shrink-0"
          />
        </div>
      </div>

      <div className={`flex items-center gap-1 transition-opacity ${isPending ? '' : 'opacity-0 group-hover:opacity-100'}`}>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReassign(task) }}
          title="Change project"
          className="hidden items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm transition-all hover:-translate-y-px hover:border-brand-200 hover:bg-brand-50/70 hover:text-brand-700 hover:shadow-md group-hover:flex"
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </button>
        {isPending ? (
          <>
            <button
              className="flex min-w-[4.5rem] items-center justify-center gap-1 rounded-md border border-brand-200 bg-brand-50/80 px-2.5 py-1.5 text-xs font-medium text-brand-700 shadow-sm transition-all hover:-translate-y-px hover:bg-brand-100/80 hover:shadow-md"
              onClick={() => { updateTask.mutate({ id: task.id, data: { status: 'active' } }); toast.success('Task moved to Active') }}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              Activate
            </button>
            <button
              className="flex items-center gap-1 rounded-md border border-critical-100 bg-critical-50/60 px-2.5 py-1.5 text-xs font-medium text-critical shadow-sm transition-all hover:-translate-y-px hover:bg-critical-100/60 hover:shadow-md"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(task.id) }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </>
        ) : task.status === 'active' ? (
          <>
            <button
              className="flex min-w-[4.5rem] items-center justify-center gap-1 rounded-md border border-success/20 bg-success/10 px-2.5 py-1.5 text-xs font-medium text-success shadow-sm transition-all hover:-translate-y-px hover:bg-success/15 hover:shadow-md"
              onClick={() => {
                const prevStatus = task.status
                updateTask.mutate({ id: task.id, data: { status: 'completed' } })
                toast.success('Task completed', {
                  action: { label: 'Undo', onClick: () => updateTask.mutate({ id: task.id, data: { status: prevStatus } }) },
                })
              }}
            >
              <Check className="h-3.5 w-3.5" />
              Done
            </button>
            <button
              className="flex items-center gap-1 rounded-md border border-critical-100 bg-critical-50/60 px-2.5 py-1.5 text-xs font-medium text-critical shadow-sm transition-all hover:-translate-y-px hover:bg-critical-100/60 hover:shadow-md"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(task.id) }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
