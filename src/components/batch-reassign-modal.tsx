'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import { UserRound, FolderOpen, Plus, Check, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'
import { CACHE_TIME } from '@/lib/query-cache'

type Identity = { id: string; name: string }
type Project = { id: string; name: string; identity: Identity | null }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  ids: string[]
  batchApiEndpoint?: string
  entityLabel?: string
  onSuccess?: () => void
}

export function BatchReassignModal({ open, onOpenChange, ids, batchApiEndpoint = '/api/tasks/batch', entityLabel = 'task', onSuccess }: Props) {
  const queryClient = useQueryClient()

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectIdentityId, setNewProjectIdentityId] = useState<string | ''>('')
  const [showNewIdentity, setShowNewIdentity] = useState(false)
  const [newIdentityName, setNewIdentityName] = useState('')
  const [collapsedIdentities, setCollapsedIdentities] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const { data: projectsRes } = useQuery({
    queryKey: ['projects'],
    queryFn: () => fetch('/api/projects').then((r) => r.json()),
    enabled: open,
    staleTime: CACHE_TIME.taxonomy,
  })
  const { data: identitiesRes } = useQuery({
    queryKey: ['identities'],
    queryFn: () => fetch('/api/identities').then((r) => r.json()),
    enabled: open,
    staleTime: CACHE_TIME.taxonomy,
  })

  const projects = useMemo(() => (projectsRes?.data || []) as Project[], [projectsRes?.data])
  const identities = useMemo(() => (identitiesRes?.data || []) as Identity[], [identitiesRes?.data])

  const grouped = useMemo(() => {
    const map = new Map<string, { identity: Identity | null; projects: Project[] }>()
    for (const project of projects) {
      const key = project.identity?.id || '__none__'
      if (!map.has(key)) map.set(key, { identity: project.identity, projects: [] })
      map.get(key)?.projects.push(project)
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.identity?.name || 'zzz').localeCompare(b.identity?.name || 'zzz')
    )
  }, [projects])

  const filteredGrouped = useMemo(() => {
    if (!search.trim()) return grouped
    const query = search.toLowerCase()
    return grouped
      .map((group) => ({
        ...group,
        projects: group.projects.filter(
          (p) => p.name.toLowerCase().includes(query) || group.identity?.name.toLowerCase().includes(query)
        ),
      }))
      .filter((g) => g.projects.length > 0)
  }, [grouped, search])

  const toggleIdentity = (key: string) =>
    setCollapsedIdentities((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })

  const reset = () => {
    setSelectedProjectId(null)
    setSearch('')
    setShowNewProject(false)
    setNewProjectName('')
    setNewProjectIdentityId('')
    setShowNewIdentity(false)
    setNewIdentityName('')
    setSaving(false)
  }

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  const handleConfirm = async () => {
    setSaving(true)
    try {
      let projectId = selectedProjectId
      let identityId = newProjectIdentityId || null

      if (showNewProject && showNewIdentity && newIdentityName.trim()) {
        const identityRes = await fetch('/api/identities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newIdentityName.trim() }),
        })
        const identityData = await identityRes.json()
        if (!identityData.data?.id) throw new Error('Failed to create identity')
        identityId = identityData.data.id
        queryClient.invalidateQueries({ queryKey: ['identities'] })
      }

      if (showNewProject && newProjectName.trim()) {
        const projectRes = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newProjectName.trim(), identityId }),
        })
        const projectData = await projectRes.json()
        if (!projectData.data?.id) throw new Error('Failed to create project')
        projectId = projectData.data.id
        queryClient.invalidateQueries({ queryKey: ['projects'] })
      }

      if (!projectId) { toast.error('Please select or create a project'); return }

      const res = await fetch(batchApiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'reassign', projectId }),
      })
      if (!res.ok) throw new Error(`Failed to reassign ${entityLabel}s`)

      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['emails'] })
      toast.success(`${ids.length} ${entityLabel}${ids.length === 1 ? '' : 's'} moved to project`)
      onSuccess?.()
      handleClose(false)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const canConfirm = selectedProjectId || (showNewProject && newProjectName.trim())

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change project for {ids.length} {entityLabel}{ids.length === 1 ? '' : 's'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />

          <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200">
            {filteredGrouped.length === 0 && !showNewProject ? (
              <p className="px-3 py-4 text-center text-sm text-slate-400">No projects found</p>
            ) : (
              filteredGrouped.map((group) => {
                const key = group.identity?.id || '__none__'
                const isCollapsed = collapsedIdentities.has(key)
                return (
                  <div key={key}>
                    <button
                      type="button"
                      onClick={() => toggleIdentity(key)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                      <UserRound className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-500">
                        {group.identity?.name || 'No identity'}
                      </span>
                    </button>
                    {!isCollapsed &&
                      group.projects.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { setSelectedProjectId(p.id); setShowNewProject(false) }}
                          className={`flex w-full items-center gap-2 pl-8 pr-3 py-2 text-left text-sm hover:bg-slate-50 ${
                            selectedProjectId === p.id ? 'bg-brand-50 text-brand-700' : 'text-slate-700'
                          }`}
                        >
                          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                          <span className="flex-1 truncate">{p.name}</span>
                          {selectedProjectId === p.id && <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" />}
                        </button>
                      ))}
                  </div>
                )
              })
            )}
          </div>

          {!showNewProject ? (
            <button
              type="button"
              onClick={() => { setShowNewProject(true); setSelectedProjectId(null) }}
              className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700"
            >
              <Plus className="h-3.5 w-3.5" /> New project
            </button>
          ) : (
            <div className="space-y-2 rounded-lg border border-brand-100 bg-brand-50/40 p-3">
              <div className="space-y-1">
                <Label className="text-xs">Project name</Label>
                <Input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. Client ABC"
                  className="h-8 text-sm"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Identity (optional)</Label>
                {!showNewIdentity ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={newProjectIdentityId}
                      onChange={(e) => setNewProjectIdentityId(e.target.value)}
                      className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">None</option>
                      {identities.map((i) => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowNewIdentity(true)}
                      className="text-xs text-brand-600 hover:text-brand-700 whitespace-nowrap"
                    >
                      + New
                    </button>
                  </div>
                ) : (
                  <Input
                    value={newIdentityName}
                    onChange={(e) => setNewIdentityName(e.target.value)}
                    placeholder="Identity name"
                    className="h-8 text-sm"
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => { setShowNewProject(false); setNewProjectName(''); setNewProjectIdentityId(''); setShowNewIdentity(false); setNewIdentityName('') }}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <DialogFooter className="mt-2 gap-2">
          <Button variant="outline" size="sm" onClick={() => handleClose(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={saving || !canConfirm}>
            {saving ? 'Saving...' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
