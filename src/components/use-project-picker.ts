'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CACHE_TIME } from '@/lib/query-cache'

export type Identity = { id: string; name: string }
export type Project = { id: string; name: string; identity: Identity | null }
export type GroupedProjects = { identity: Identity | null; projects: Project[] }

export function useProjectPicker(open: boolean) {
  const queryClient = useQueryClient()

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectIdentityId, setNewProjectIdentityId] = useState<string | ''>('')
  const [showNewIdentity, setShowNewIdentity] = useState(false)
  const [newIdentityName, setNewIdentityName] = useState('')
  const [collapsedIdentities, setCollapsedIdentities] = useState<Set<string>>(new Set())

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

  const grouped = useMemo<GroupedProjects[]>(() => {
    const map = new Map<string, GroupedProjects>()
    for (const project of projects) {
      const key = project.identity?.id || '__none__'
      if (!map.has(key)) map.set(key, { identity: project.identity, projects: [] })
      map.get(key)?.projects.push(project)
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.identity?.name || 'zzz').localeCompare(b.identity?.name || 'zzz')
    )
  }, [projects])

  const filteredGrouped = useMemo<GroupedProjects[]>(() => {
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

  const resetPickerState = () => {
    setSelectedProjectId(null)
    setSearch('')
    setShowNewProject(false)
    setNewProjectName('')
    setNewProjectIdentityId('')
    setShowNewIdentity(false)
    setNewIdentityName('')
  }

  // Resolve project (create identity/project if needed), returns projectId or null
  async function resolveOrCreateProject(): Promise<string | null> {
    let projectId = selectedProjectId
    let identityId: string | null = newProjectIdentityId || null

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

    return projectId
  }

  return {
    // queries
    projects,
    identities,
    grouped,
    filteredGrouped,
    // search/collapse
    search,
    setSearch,
    collapsedIdentities,
    toggleIdentity,
    // picker state
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
    // actions
    resetPickerState,
    resolveOrCreateProject,
  }
}
