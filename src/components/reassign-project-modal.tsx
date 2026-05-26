'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UserRound, FolderOpen, Plus, Check, ChevronDown, ChevronRight, Mail, CheckSquare, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'
import { useProjectPicker, type Identity } from '@/components/use-project-picker'

type RelatedTask = { id: string; title: string; project: { id: string; name: string; identity: Identity | null } | null }
type RelatedItems = { threadId: string; emailCount: number; tasks: RelatedTask[] }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  threadId?: string
  taskId?: string
  currentProject?: { id: string; name: string; identity: { id: string; name: string } | null } | null
  invalidateKeys?: string[][]
}

export function ReassignProjectModal({
  open,
  onOpenChange,
  threadId,
  taskId,
  currentProject,
  invalidateKeys = [],
}: Props) {
  const queryClient = useQueryClient()
  const picker = useProjectPicker(open)
  const {
    identities,
    filteredGrouped,
    search,
    setSearch,
    collapsedIdentities,
    toggleIdentity,
    selectedProjectId,
    setSelectedProjectId,
    showNewProject,
    setShowNewProject,
    newProjectName,
    setNewProjectName,
    newProjectIdentityId,
    setNewProjectIdentityId,
    showNewIdentity,
    setShowNewIdentity,
    newIdentityName,
    setNewIdentityName,
    resetPickerState,
    resolveOrCreateProject,
  } = picker

  const [nextLoading, setNextLoading] = useState(false)

  // Step 2 state
  const [step, setStep] = useState<'pick' | 'review'>('pick')
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null)
  const [relatedItems, setRelatedItems] = useState<RelatedItems | null>(null)
  const [includeThread, setIncludeThread] = useState(true)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const reset = () => {
    resetPickerState()
    setNextLoading(false)
    setStep('pick')
    setPendingProjectId(null)
    setRelatedItems(null)
    setIncludeThread(true)
    setSelectedTaskIds(new Set())
    setSaving(false)
  }

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  async function handleNext() {
    setNextLoading(true)
    try {
      const projectId = await resolveOrCreateProject()
      if (!projectId) { toast.error('Please select or create a project'); return }

      // Standalone task — skip review step
      if (!threadId) {
        await saveTaskDirect(projectId)
        return
      }

      // Fetch related items
      const res = await fetch(`/api/threads/${threadId}/related`)
      const data = await res.json()
      const related: RelatedItems = data.data

      // No tasks to review — save directly
      if (!related || related.tasks.length === 0) {
        await saveThread(projectId, true, [])
        return
      }

      // Show review step
      setRelatedItems(related)
      setPendingProjectId(projectId)
      setIncludeThread(true)
      setSelectedTaskIds(new Set(related.tasks.map((t) => t.id)))
      setStep('review')
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setNextLoading(false)
    }
  }

  async function saveThread(projectId: string, incThread: boolean, tIds: string[]) {
    const res = await fetch('/api/threads/reassign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, projectId, includeThread: incThread, taskIds: tIds }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.message ?? data.error ?? 'Failed to reassign')

    const { affectedEmails, affectedTasks } = data.data
    toast.success(
      `Reassigned: ${affectedEmails} email${affectedEmails !== 1 ? 's' : ''} and ${affectedTasks} task${affectedTasks !== 1 ? 's' : ''} updated`
    )
    invalidateAll()
    handleClose(false)
  }

  async function saveTaskDirect(projectId: string) {
    const res = await fetch(`/api/tasks/${taskId}/reassign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.message ?? data.error ?? 'Failed to reassign task')
    toast.success('Project updated')
    invalidateAll()
    handleClose(false)
  }

  function invalidateAll() {
    for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key })
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['emails'] })
  }

  async function handleConfirm() {
    if (!pendingProjectId) return
    setSaving(true)
    try {
      await saveThread(pendingProjectId, includeThread, [...selectedTaskIds])
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const canNext = showNewProject ? !!newProjectName.trim() : !!selectedProjectId
  const isCurrentProject = (id: string) => id === currentProject?.id
  const nothingSelected = !includeThread && selectedTaskIds.size === 0

  return (
    <>
      {/* Step 1: Pick project */}
      <Dialog open={open && step === 'pick'} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Project</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {currentProject && (
              <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                <span className="font-medium text-slate-400">Current:</span>
                <UserRound className="h-3 w-3" />
                <span>{currentProject.identity?.name || 'Unassigned'}</span>
                <ChevronRight className="h-3 w-3 text-slate-300" />
                <FolderOpen className="h-3 w-3" />
                <span className="font-medium text-slate-700">{currentProject.name}</span>
              </div>
            )}

            {!showNewProject ? (
              <>
                <Input
                  placeholder="Search projects..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9"
                />

                <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                  {filteredGrouped.length === 0 && (
                    <p className="px-3 py-4 text-center text-xs text-slate-400">No projects found</p>
                  )}
                  {filteredGrouped.map((group) => {
                    const key = group.identity?.id || '__none__'
                    const isCollapsed = collapsedIdentities.has(key)
                    return (
                      <div key={key}>
                        <button
                          onClick={() => toggleIdentity(key)}
                          className="flex w-full items-center gap-2 bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-100"
                        >
                          <ChevronDown className={`h-3 w-3 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                          <UserRound className="h-3 w-3" />
                          {group.identity?.name || 'No Identity'}
                        </button>
                        {!isCollapsed &&
                          group.projects.map((project) => (
                            <button
                              key={project.id}
                              onClick={() => setSelectedProjectId(project.id)}
                              disabled={isCurrentProject(project.id)}
                              className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${
                                isCurrentProject(project.id)
                                  ? 'cursor-default text-slate-400'
                                  : selectedProjectId === project.id
                                    ? 'bg-brand-50 text-brand-700'
                                    : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                              <span className="flex-1">{project.name}</span>
                              {isCurrentProject(project.id) && (
                                <span className="text-[10px] text-slate-400">current</span>
                              )}
                              {selectedProjectId === project.id && !isCurrentProject(project.id) && (
                                <Check className="h-3.5 w-3.5 text-brand-600" />
                              )}
                            </button>
                          ))}
                      </div>
                    )
                  })}
                </div>

                <button
                  onClick={() => { setShowNewProject(true); setSelectedProjectId(null) }}
                  className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create new project
                </button>
              </>
            ) : (
              <div className="space-y-3 rounded-lg border border-brand-100 bg-brand-50/40 p-4">
                <p className="text-xs font-semibold text-brand-700">New Project</p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Project name</Label>
                  <Input
                    placeholder="e.g. Website Redesign"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="h-9"
                    autoFocus
                  />
                </div>
                {!showNewIdentity ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Identity (optional)</Label>
                    <select
                      value={newProjectIdentityId}
                      onChange={(e) => setNewProjectIdentityId(e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">None</option>
                      {identities.map((identity) => (
                        <option key={identity.id} value={identity.id}>{identity.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setShowNewIdentity(true)}
                      className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
                    >
                      <Plus className="h-3 w-3" />
                      Create new identity instead
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-xs">New identity name</Label>
                    <Input
                      placeholder="e.g. PM at TechCorp"
                      value={newIdentityName}
                      onChange={(e) => setNewIdentityName(e.target.value)}
                      className="h-9"
                    />
                    <button
                      onClick={() => { setShowNewIdentity(false); setNewIdentityName('') }}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      Pick existing identity instead
                    </button>
                  </div>
                )}
                <button
                  onClick={() => {
                    setShowNewProject(false)
                    setNewProjectName('')
                    setNewProjectIdentityId('')
                    setShowNewIdentity(false)
                    setNewIdentityName('')
                  }}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  ← Back to existing projects
                </button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
            <Button onClick={handleNext} disabled={nextLoading || !canNext}>
              {nextLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Next →
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step 2: Review scope */}
      <Dialog open={open && step === 'review'} onOpenChange={(v) => { if (!v) handleClose(false) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Apply to related items?</DialogTitle>
          </DialogHeader>

          <div className="space-y-2 py-1">
            <p className="text-xs text-slate-500">
              Select which items should be moved to the new project.
            </p>

            {relatedItems && (
              <div className="space-y-1.5">
                {/* Thread emails row */}
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 hover:bg-slate-100/60">
                  <input
                    type="checkbox"
                    checked={includeThread}
                    onChange={(e) => setIncludeThread(e.target.checked)}
                    className="h-4 w-4 rounded accent-brand-600"
                  />
                  <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="text-sm text-slate-700">
                    {relatedItems.emailCount} email{relatedItems.emailCount !== 1 ? 's' : ''} in this thread
                  </span>
                </label>

                {/* Individual task rows */}
                {relatedItems.tasks.map((task) => (
                  <label
                    key={task.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTaskIds.has(task.id)}
                      onChange={(e) => {
                        setSelectedTaskIds((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) {
                            next.add(task.id)
                          } else {
                            next.delete(task.id)
                          }
                          return next
                        })
                      }}
                      className="h-4 w-4 rounded accent-brand-600"
                    />
                    <CheckSquare className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{task.title}</span>
                  </label>
                ))}
              </div>
            )}

            {nothingSelected && (
              <p className="text-xs text-warning">Select at least one item to reassign.</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStep('pick')}>← Back</Button>
            <Button onClick={handleConfirm} disabled={saving || nothingSelected}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
