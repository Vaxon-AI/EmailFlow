'use client'

// Demo-local TaskListView — Identity → Project collapsible tree.
// Mirrors src/app/dashboard/tasks/page.tsx (TaskListView, L1494-1728).
// Demo simplifications: no inline rename. Bulk-select supported when caller
// passes selectedIds / onToggleSelect / onBulkToggle.

import { useCallback, useMemo, useState } from 'react'
import { ChevronDown, FolderOpen, UserRound } from 'lucide-react'
import { useDemoStore } from '@/lib/demo/store'
import type { DemoTask } from '@/lib/demo/types'
import { cn } from '@/lib/utils'
import { DemoTaskRow } from './demo-task-row'

const UNCATEGORIZED_GROUP_ID = '__unassigned__'

type ProjectGroup = { id: string; name: string; items: DemoTask[] }
type IdentityGroup = { id: string; name: string; projects: ProjectGroup[] }

function sortItemsWithinGroup(items: DemoTask[]): DemoTask[] {
  const active = items.filter((t) => t.status !== 'completed')
  const done = items.filter((t) => t.status === 'completed')
  return [...active, ...done]
}

function latestScore(items: DemoTask[]): number {
  if (items.length === 0) return 0
  return Math.max(...items.map((t) => t.priorityScore ?? 0))
}

export function DemoTaskListView({
  tasks,
  focusProjectId,
  selectedIds,
  onToggleSelect,
  onBulkToggle,
}: {
  tasks: DemoTask[]
  focusProjectId?: string
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  onBulkToggle?: (ids: string[], select: boolean) => void
}) {
  const { getProject, getIdentity } = useDemoStore()
  const [collapsedIdentities, setCollapsedIdentities] = useState<Set<string>>(new Set())
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())
  const [userHasToggled, setUserHasToggled] = useState(false)
  const selectable = !!onBulkToggle && !!onToggleSelect

  const toggleIdentity = useCallback((id: string) => {
    setUserHasToggled(true)
    setCollapsedIdentities((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleProject = useCallback((id: string) => {
    setUserHasToggled(true)
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const { identityGroups, ungrouped } = useMemo(() => {
    const ungroupedTasks: DemoTask[] = []
    const identityMap = new Map<
      string,
      { name: string; projectMap: Map<string, { name: string; items: DemoTask[] }> }
    >()

    for (const task of tasks) {
      const project = task.projectId ? getProject(task.projectId) : undefined
      if (!project) {
        ungroupedTasks.push(task)
        continue
      }
      const identity = getIdentity(project.identityId)
      const iId = identity?.id ?? UNCATEGORIZED_GROUP_ID
      const iName = identity?.name ?? 'Unassigned'
      if (!identityMap.has(iId)) identityMap.set(iId, { name: iName, projectMap: new Map() })
      const ig = identityMap.get(iId)!
      if (!ig.projectMap.has(project.id)) {
        ig.projectMap.set(project.id, { name: project.name, items: [] })
      }
      ig.projectMap.get(project.id)!.items.push(task)
    }

    const groups: IdentityGroup[] = Array.from(identityMap.entries())
      .map(([id, { name, projectMap }]) => {
        const projects = Array.from(projectMap.entries())
          .map(([pid, { name: pName, items }]) => ({
            id: pid,
            name: pName,
            items: sortItemsWithinGroup(items),
          }))
          .sort((a, b) => latestScore(b.items) - latestScore(a.items))
        return { id, name, projects }
      })
      .sort(
        (a, b) =>
          latestScore(b.projects.flatMap((p) => p.items)) -
          latestScore(a.projects.flatMap((p) => p.items)),
      )

    return { identityGroups: groups, ungrouped: sortItemsWithinGroup(ungroupedTasks) }
  }, [tasks, getProject, getIdentity])

  if (tasks.length === 0) return null

  const sel = selectedIds ?? new Set<string>()
  const ungroupedIds = ungrouped.map((t) => t.id)
  const allUngroupedSel = ungroupedIds.length > 0 && ungroupedIds.every((id) => sel.has(id))
  const someUngroupedSel = ungroupedIds.some((id) => sel.has(id))

  return (
    <div className="space-y-2">
      {identityGroups.map((identity) => {
        const isIdentityCollapsed =
          !userHasToggled && focusProjectId
            ? !identity.projects.some((p) => p.id === focusProjectId)
            : collapsedIdentities.has(identity.id)
        const totalCount = identity.projects.reduce((s, p) => s + p.items.length, 0)
        const identityTaskIds = identity.projects.flatMap((p) => p.items.map((t) => t.id))
        const allIdentitySel = identityTaskIds.length > 0 && identityTaskIds.every((id) => sel.has(id))
        const someIdentitySel = identityTaskIds.some((id) => sel.has(id))
        return (
          <div
            key={identity.id}
            className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm"
          >
            <div className="group flex w-full items-center gap-2 px-4 py-3 transition-colors hover:bg-slate-50">
              {selectable && (
                <input
                  type="checkbox"
                  checked={allIdentitySel}
                  ref={(el) => {
                    if (el) el.indeterminate = someIdentitySel && !allIdentitySel
                  }}
                  onChange={() => onBulkToggle?.(identityTaskIds, !allIdentitySel)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select all tasks under ${identity.name}`}
                  className={cn(
                    'h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-brand-600 transition-opacity',
                    allIdentitySel || someIdentitySel
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100',
                  )}
                />
              )}
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
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 ${isIdentityCollapsed ? '-rotate-90' : ''}`}
                />
                <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  {identity.name}
                </span>
                <span className="ml-auto text-xs text-slate-400">
                  {totalCount} task{totalCount !== 1 ? 's' : ''} shown
                </span>
              </div>
            </div>

            {!isIdentityCollapsed && (
              <div className="animate-soft-enter divide-y divide-slate-100 border-t border-slate-100">
                {identity.projects.map((project) => {
                  const isProjectCollapsed =
                    !userHasToggled && focusProjectId
                      ? project.id !== focusProjectId
                      : collapsedProjects.has(project.id)
                  const projectTaskIds = project.items.map((t) => t.id)
                  const allProjectSel =
                    projectTaskIds.length > 0 && projectTaskIds.every((id) => sel.has(id))
                  const someProjectSel = projectTaskIds.some((id) => sel.has(id))
                  return (
                    <div key={project.id}>
                      <div className="group flex w-full items-center gap-2 px-5 py-2.5 transition-colors hover:bg-slate-50/70">
                        {selectable && (
                          <input
                            type="checkbox"
                            checked={allProjectSel}
                            ref={(el) => {
                              if (el) el.indeterminate = someProjectSel && !allProjectSel
                            }}
                            onChange={() =>
                              onBulkToggle?.(projectTaskIds, !allProjectSel)
                            }
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select all tasks under ${project.name}`}
                            className={cn(
                              'h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-brand-600 transition-opacity',
                              allProjectSel || someProjectSel
                                ? 'opacity-100'
                                : 'opacity-0 group-hover:opacity-100',
                            )}
                          />
                        )}
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
                          <ChevronDown
                            className={`h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform duration-150 ${isProjectCollapsed ? '-rotate-90' : ''}`}
                          />
                          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className="text-sm font-medium text-slate-700">{project.name}</span>
                          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                            {project.items.length}
                          </span>
                        </div>
                      </div>

                      {!isProjectCollapsed && (
                        <div className="animate-soft-enter space-y-2 px-4 pb-3 pt-1">
                          {project.items.map((task) => (
                            <DemoTaskRow
                              key={task.id}
                              task={task}
                              isSelected={selectable ? sel.has(task.id) : undefined}
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
          <div className="group flex items-center gap-2 px-4 py-3">
            {selectable && (
              <input
                type="checkbox"
                checked={allUngroupedSel}
                ref={(el) => {
                  if (el) el.indeterminate = someUngroupedSel && !allUngroupedSel
                }}
                onChange={() => onBulkToggle?.(ungroupedIds, !allUngroupedSel)}
                aria-label="Select all uncategorized tasks"
                className={cn(
                  'h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-brand-600 transition-opacity',
                  allUngroupedSel || someUngroupedSel
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100',
                )}
              />
            )}
            <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Uncategorized
            </span>
            <span className="ml-auto text-xs text-slate-400">
              {ungrouped.length} task{ungrouped.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2 border-t border-slate-100 px-4 pb-3 pt-2">
            {ungrouped.map((task) => (
              <DemoTaskRow
                key={task.id}
                task={task}
                isSelected={selectable ? sel.has(task.id) : undefined}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
