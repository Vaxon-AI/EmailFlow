'use client'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { IdentitySummary, ProjectSummary } from './use-tasks-page-data'

export function TaskIdentityProjectPicker({
  identities,
  filteredProjects,
  selectedIdentityId,
  selectedIdentityName,
  selectedProjectId,
  selectedProjectName,
  onIdentityChange,
  onProjectChange,
}: {
  identities: IdentitySummary[]
  filteredProjects: ProjectSummary[]
  selectedIdentityId: string
  selectedIdentityName?: string
  selectedProjectId: string
  selectedProjectName?: string
  onIdentityChange: (next: string) => void
  onProjectChange: (next: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        <Label>Identity <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Select
          value={selectedIdentityId || '__none__'}
          onValueChange={(value) => onIdentityChange(value === '__none__' ? '' : (value ?? ''))}
        >
          <SelectTrigger className="h-9 w-full text-sm">
            <SelectValue>
              {selectedIdentityName ?? <span className="text-muted-foreground">Any identity</span>}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Any identity</SelectItem>
            {identities.map((identity) => (
              <SelectItem key={identity.id} value={identity.id}>{identity.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Project <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Select
          value={selectedProjectId || '__none__'}
          onValueChange={(value) => onProjectChange(value === '__none__' ? '' : (value ?? ''))}
        >
          <SelectTrigger className="h-9 w-full text-sm">
            <SelectValue>
              {selectedProjectName ?? <span className="text-muted-foreground">Uncategorized</span>}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Uncategorized</SelectItem>
            {filteredProjects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                <div className="flex flex-col py-0.5">
                  <span className="font-medium">{project.name}</span>
                  {project.identity && !selectedIdentityId && (
                    <span className="text-xs text-muted-foreground">{project.identity.name}</span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
