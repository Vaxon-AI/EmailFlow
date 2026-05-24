'use client'

import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  FolderOpen,
  Loader2,
  Mail,
  Paperclip,
  UserRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { getEmailDisplayState } from '@/lib/email-classification'
import { getEmailLinkedTaskState } from '@/lib/email-linked-task-status'
import { InlineEditableName } from '@/components/inline-editable-name'
import { StatePanel } from '@/components/state-panel'
import { Badge } from '@/components/ui/badge'
import {
  EMAIL_DISPLAY_CONFIG,
  formatEmailDate,
  isNeedsActionPageEmail,
  isTrackedEmail,
  isUncertainEmail,
  type EmailItem,
  type LinkedTask,
} from './email-page-types'

type EmailProjectGroup = { id: string; name: string; items: EmailItem[] }
type EmailIdentityGroup = { id: string; name: string; projects: EmailProjectGroup[] }

export function EmailMatterView({
  emails,
  focusIdentityId,
  onReassign,
  selectedIds,
  onToggleSelect,
  onBulkToggle,
}: {
  emails: EmailItem[]
  focusIdentityId?: string
  onReassign: (email: EmailItem) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onBulkToggle: (ids: string[], select: boolean) => void
}) {
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
    queryClient.invalidateQueries({ queryKey: ['emails'] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
  }

  const renameIdentity = async (identityId: string, name: string) => {
    await fetch(`/api/identities/${identityId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    queryClient.invalidateQueries({ queryKey: ['emails'] })
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

  const { identityGroups, ungrouped } = useMemo(() => {
    const ungrouped: EmailItem[] = []
    const identityMap = new Map<string, { name: string; projectMap: Map<string, { name: string; items: EmailItem[] }> }>()

    for (const email of emails) {
      if (!email.project) {
        ungrouped.push(email)
        continue
      }
      const identityId = email.project.identity?.id || '__unassigned__'
      const identityName = email.project.identity?.name || 'Unassigned'
      const projectId = email.project.id
      const projectName = email.project.name
      if (!identityMap.has(identityId)) identityMap.set(identityId, { name: identityName, projectMap: new Map() })
      const identity = identityMap.get(identityId)!
      if (!identity.projectMap.has(projectId)) identity.projectMap.set(projectId, { name: projectName, items: [] })
      identity.projectMap.get(projectId)!.items.push(email)
    }

    const latestTime = (items: EmailItem[]) => Math.max(...items.map((email) => new Date(email.receivedAt).getTime()))

    const identityGroups: EmailIdentityGroup[] = Array.from(identityMap.entries())
      .map(([id, { name, projectMap }]) => {
        const projects = Array.from(projectMap.entries())
          .map(([projectId, { name: projectName, items }]) => ({ id: projectId, name: projectName, items }))
          .sort((a, b) => latestTime(b.items) - latestTime(a.items))
        return { id, name, projects }
      })
      .sort((a, b) => latestTime(b.projects.flatMap((project) => project.items)) - latestTime(a.projects.flatMap((project) => project.items)))

    return { identityGroups, ungrouped }
  }, [emails])

  if (emails.length === 0) {
    return (
      <StatePanel
        icon={<Mail className="h-5 w-5 text-gray-400" />}
        title="No emails in this view"
        description="Change the current filters to see more mail."
      />
    )
  }

  const attentionCount = (list: EmailItem[]) => list.filter(isNeedsActionPageEmail).length
  const ungroupedIds = ungrouped.map((email) => email.id)
  const allUngroupedSelected = ungroupedIds.length > 0 && ungroupedIds.every((id) => selectedIds.has(id))
  const someUngroupedSelected = ungroupedIds.some((id) => selectedIds.has(id))

  return (
    <div className="space-y-2">
      {identityGroups.map((identity) => {
        const isIdentityCollapsed = !userHasToggled && focusIdentityId
          ? identity.id !== focusIdentityId
          : collapsedIdentities.has(identity.id)
        const totalCount = identity.projects.reduce((sum, project) => sum + project.items.length, 0)
        const totalAttention = identity.projects.reduce((sum, project) => sum + attentionCount(project.items), 0)
        const identityEmailIds = identity.projects.flatMap((project) => project.items.map((email) => email.id))
        const allIdentitySelected = identityEmailIds.length > 0 && identityEmailIds.every((id) => selectedIds.has(id))
        const someIdentitySelected = identityEmailIds.some((id) => selectedIds.has(id))

        return (
          <div key={identity.id} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="group flex w-full items-center gap-2.5 px-4 py-3 transition-colors hover:bg-slate-50">
              <input
                type="checkbox"
                checked={allIdentitySelected}
                ref={(el) => { if (el) el.indeterminate = someIdentitySelected && !allIdentitySelected }}
                onChange={() => onBulkToggle(identityEmailIds, !allIdentitySelected)}
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
                {totalAttention > 0 && (
                  <span className="rounded-full bg-critical-50 px-2 py-0.5 text-[10px] font-semibold text-critical ring-1 ring-critical-100">
                    {totalAttention} need action
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-400">{totalCount} email{totalCount !== 1 ? 's' : ''} shown</span>
              </div>
            </div>

            {!isIdentityCollapsed && (
              <div className="animate-soft-enter divide-y divide-slate-100 border-t border-slate-100">
                {identity.projects.map((project) => {
                  const isProjectCollapsed = collapsedProjects.has(project.id)
                  const projectAttention = attentionCount(project.items)
                  const projectEmailIds = project.items.map((email) => email.id)
                  const allProjectSelected = projectEmailIds.length > 0 && projectEmailIds.every((id) => selectedIds.has(id))
                  const someProjectSelected = projectEmailIds.some((id) => selectedIds.has(id))

                  return (
                    <div key={project.id}>
                      <div className="group flex w-full items-center gap-2.5 px-5 py-2.5 transition-colors hover:bg-slate-50/70">
                        <input
                          type="checkbox"
                          checked={allProjectSelected}
                          ref={(el) => { if (el) el.indeterminate = someProjectSelected && !allProjectSelected }}
                          onChange={() => onBulkToggle(projectEmailIds, !allProjectSelected)}
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
                          {projectAttention > 0 && (
                            <span className="rounded-full bg-critical-50 px-1.5 py-0.5 text-[10px] font-semibold text-critical">
                              {projectAttention}
                            </span>
                          )}
                          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{project.items.length} shown</span>
                        </div>
                      </div>

                      {!isProjectCollapsed && (
                        <div className="animate-soft-enter space-y-1.5 px-4 pb-3 pt-1">
                          {project.items.map((email) => (
                            <EmailRow
                              key={email.id}
                              email={email}
                              onReassign={onReassign}
                              isSelected={selectedIds.has(email.id)}
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
            <span className="ml-auto text-xs text-slate-400">{ungrouped.length} email{ungrouped.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-1.5 border-t border-slate-100 px-4 pb-3 pt-2">
            {ungrouped.map((email) => (
              <EmailRow
                key={email.id}
                email={email}
                onReassign={onReassign}
                isSelected={selectedIds.has(email.id)}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EmailRow({
  email,
  compact,
  onReassign,
  isSelected,
  onToggleSelect,
}: {
  email: EmailItem
  compact?: boolean
  onReassign?: (email: EmailItem) => void
  isSelected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const matter = email.matter ?? null
  const linkedTasks = email.taskLinks?.map((link) => link.task).filter((task): task is LinkedTask => task != null) || []
  const linkedTaskState = isTrackedEmail(email) ? getEmailLinkedTaskState(email.taskLinks) : null
  const isCompletedTrackedEmail = linkedTaskState === 'completed'
  const attentionBar = isNeedsActionPageEmail(email)
    ? 'border-l-2 border-l-critical'
    : isUncertainEmail(email)
      ? 'border-l-2 border-l-warning'
      : ''

  return (
    <div className={`group flex items-center gap-3 rounded-xl border px-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:shadow-sm ${
      isSelected
        ? 'border-brand-300 bg-brand-50/50'
        : isCompletedTrackedEmail
          ? 'border-slate-100 bg-slate-50/55 hover:border-slate-200 hover:bg-slate-50/80'
          : `border-gray-200/80 bg-white hover:border-brand-200 hover:bg-brand-50/60 ${attentionBar}`
    } ${compact ? 'py-2 opacity-75' : 'py-3'}`}
    >
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => { e.stopPropagation(); onToggleSelect(email.id) }}
          onClick={(e) => e.stopPropagation()}
          className={`h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-brand-600 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        />
      )}
      <Link href={`/dashboard/emails/${email.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <ClassBadge
          classification={email.classification}
          actioned={email.actioned}
          processingStatus={email.processingStatus}
          taskLinks={email.taskLinks}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={`truncate font-medium ${isCompletedTrackedEmail ? 'text-slate-500' : 'text-gray-900'} ${compact ? 'text-xs' : 'text-sm'}`}>{email.subject}</p>
            {email.hasAttachments && <Paperclip className="h-3 w-3 flex-shrink-0 text-gray-400" />}
            {isCompletedTrackedEmail && <CompleteBadge />}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <p className={`truncate text-xs ${isCompletedTrackedEmail ? 'text-slate-400' : 'text-gray-500'}`}>{email.sender?.split('<')[0]?.trim()}</p>
            {email.accountEmail && <AccountBadge account={email.accountEmail} />}
            {matter ? (
              <>
                <span className="text-[10px] text-gray-300">&middot;</span>
                <span className={`truncate text-[11px] ${isCompletedTrackedEmail ? 'text-slate-300' : 'text-gray-400'}`}>{matter.title}</span>
              </>
            ) : null}
          </div>
        </div>
        <span className={`flex-shrink-0 text-xs ${isCompletedTrackedEmail ? 'text-slate-300' : 'text-gray-400'}`}>{formatEmailDate(email.receivedAt)}</span>
      </Link>

      <RetentionBadge status={email.retentionStatus} />

      {linkedTasks.length > 0 && (
        <div className="shrink-0 items-center gap-1.5 flex">
          {linkedTasks.map((task) => (
            <Link
              key={task.id}
              href={`/dashboard/tasks/${task.id}`}
              onClick={(e) => e.stopPropagation()}
              className={`inline-flex max-w-[140px] items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                task.status === 'completed'
                  ? 'border-success-100 bg-success-50/70 text-success hover:bg-success-100/70'
                  : 'border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100'
              }`}
              title={task.title}
            >
              {task.status === 'completed'
                ? <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                : <CheckSquare className="h-2.5 w-2.5 shrink-0" />}
              <span className="truncate">{task.title}</span>
            </Link>
          ))}
        </div>
      )}

      {onReassign && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReassign(email) }}
          title="Change project"
          className="hidden shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-500 transition-colors hover:border-brand-300 hover:text-brand-600 group-hover:flex"
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function CompleteBadge() {
  return (
    <Badge variant="outline" className="shrink-0 gap-1 border-success-100 bg-success-50/70 py-0 text-[10px] text-success">
      <CheckCircle2 className="h-3 w-3" />
      Complete
    </Badge>
  )
}

function RetentionBadge({ status }: { status?: string | null }) {
  if (!status || status === 'ACTIVE') return null
  const config = {
    ARCHIVED: { label: 'Archived', className: 'border-gray-200 bg-gray-50 text-gray-500' },
    METADATA_ONLY: { label: 'Body only', className: 'border-warning-200 bg-warning-100/60 text-warning-700' },
    PURGED: { label: 'Purged', className: 'border-critical-100 bg-critical-50 text-critical' },
  }[status] ?? null
  if (!config) return null

  return (
    <Badge variant="outline" className={`shrink-0 py-0 text-[10px] ${config.className}`}>
      {config.label}
    </Badge>
  )
}

function ClassBadge({
  classification,
  actioned,
  processingStatus,
  taskLinks,
}: {
  classification?: string | null
  actioned?: boolean | null
  processingStatus?: string | null
  taskLinks?: EmailItem['taskLinks']
}) {
  const state = getEmailDisplayState({ classification, actioned, taskLinks })
  if (state === 'tracked') return null

  if (!classification && processingStatus === 'pending') {
    return (
      <Badge variant="outline" className="w-[104px] justify-center gap-1 border-gray-200 bg-gray-50 text-[10px] text-gray-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        Processing
      </Badge>
    )
  }

  if (state !== 'needs_action' && state !== 'uncertain' && state !== 'unclassified') {
    return null
  }

  const config = EMAIL_DISPLAY_CONFIG[state]
  const Icon = config.icon
  return (
    <Badge variant="outline" className={`w-[104px] justify-center gap-1 text-[10px] ${config.color}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  )
}

function AccountBadge({ account }: { account: string }) {
  const domain = account.split('@')[1] || account
  const isWork = !['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com'].includes(domain)

  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium ${
      isWork ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500'
    }`}
    >
      <Mail className="h-2.5 w-2.5" />
      {domain}
    </span>
  )
}
