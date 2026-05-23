'use client'

// Demo-local version of @/components/batch-reassign-modal — a simple modal
// listing demo projects grouped by identity (plus Unassigned), used by the
// Tasks and Emails batch action bars to bulk-reassign selected items.

import { useState } from 'react'
import { Check, FolderOpen, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useDemoStore } from '@/lib/demo/store'
import { cn } from '@/lib/utils'

const UNASSIGNED_VALUE = '__unassigned__'

export function DemoBatchReassignModal({
  open,
  onOpenChange,
  ids,
  entity,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ids: string[]
  entity: 'task' | 'email'
  onSuccess?: () => void
}) {
  const { identities, projects, updateTask, reassignEmailProject } = useDemoStore()
  const [chosen, setChosen] = useState<string | null>(null)

  const apply = () => {
    if (!chosen) return
    const projectId = chosen === UNASSIGNED_VALUE ? null : chosen
    for (const id of ids) {
      if (entity === 'task') {
        // matter belongs to a project — clear it when the project changes so
        // we don't leave a stale matter pointer.
        updateTask(id, { projectId, matterId: null })
      } else {
        reassignEmailProject(id, projectId)
      }
    }
    toast.success(
      `${ids.length} ${entity}${ids.length === 1 ? '' : 's'} reassigned`,
    )
    onOpenChange(false)
    setChosen(null)
    onSuccess?.()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setChosen(null)
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change project</DialogTitle>
          <DialogDescription>
            Move {ids.length} {entity}
            {ids.length === 1 ? '' : 's'} into a different project.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
          {identities.map((identity) => {
            const projectsForIdentity = projects.filter((p) => p.identityId === identity.id)
            if (projectsForIdentity.length === 0) return null
            return (
              <div key={identity.id} className="space-y-1">
                <div className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
                  <UserRound className="h-3 w-3" />
                  {identity.name}
                </div>
                {projectsForIdentity.map((project) => {
                  const selected = chosen === project.id
                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => setChosen(project.id)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                        selected
                          ? 'border-brand-300 bg-brand-50/70'
                          : 'border-gray-200 bg-white hover:border-brand-200 hover:bg-brand-50/40',
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate text-sm font-medium text-slate-800">
                          {project.name}
                        </span>
                      </div>
                      {selected ? <Check className="h-4 w-4 text-brand-600" /> : null}
                    </button>
                  )
                })}
              </div>
            )
          })}

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Other
            </div>
            <button
              type="button"
              onClick={() => setChosen(UNASSIGNED_VALUE)}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                chosen === UNASSIGNED_VALUE
                  ? 'border-brand-300 bg-brand-50/70'
                  : 'border-gray-200 bg-white hover:border-brand-200 hover:bg-brand-50/40',
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate text-sm font-medium text-slate-800">No project</span>
              </div>
              {chosen === UNASSIGNED_VALUE ? <Check className="h-4 w-4 text-brand-600" /> : null}
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={!chosen}>
            Move {ids.length} {entity}
            {ids.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
