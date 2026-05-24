'use client'

import { Check, Mail, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { RecentEmail } from './use-tasks-page-data'

export function TaskLinkedEmailPicker({
  emailPickerOpen,
  emailPickerQuery,
  filteredEmails,
  linkedEmailIds,
  linkedEmails,
  recentEmails,
  selectedIdentityName,
  selectedProjectName,
  setEmailPickerOpen,
  setEmailPickerQuery,
  setLinkedEmailIds,
}: {
  emailPickerOpen: boolean
  emailPickerQuery: string
  filteredEmails: RecentEmail[]
  linkedEmailIds: string[]
  linkedEmails: RecentEmail[]
  recentEmails: RecentEmail[]
  selectedIdentityName?: string
  selectedProjectName?: string
  setEmailPickerOpen: (open: boolean) => void
  setEmailPickerQuery: (value: string) => void
  setLinkedEmailIds: React.Dispatch<React.SetStateAction<string[]>>
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Linked emails <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Popover open={emailPickerOpen} onOpenChange={setEmailPickerOpen}>
          <PopoverTrigger
            render={
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs">
                <Mail className="mr-1 size-3.5" />
                {linkedEmailIds.length > 0 ? `${linkedEmailIds.length} linked` : 'Link email'}
              </Button>
            }
          />
          <PopoverContent className="w-[360px] p-0" align="end">
            <div className="space-y-2 border-b p-2">
              {(selectedProjectName || (selectedIdentityName && !selectedProjectName)) && (
                <div className="px-1 text-[11px] text-muted-foreground">
                  Showing emails from{' '}
                  <span className="font-medium text-foreground">
                    {selectedProjectName ?? `${selectedIdentityName} projects`}
                  </span>
                </div>
              )}
              <Input
                placeholder="Search by subject or sender..."
                value={emailPickerQuery}
                onChange={(e) => setEmailPickerQuery(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="max-h-[260px] overflow-y-auto">
              {filteredEmails.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  {recentEmails.length === 0
                    ? 'No emails available'
                    : selectedProjectName
                      ? 'No emails for this project in the recent 50'
                      : 'No emails match your search'}
                </div>
              ) : (
                filteredEmails.map((email) => {
                  const linked = linkedEmailIds.includes(email.id)
                  return (
                    <button
                      key={email.id}
                      type="button"
                      onClick={() => {
                        setLinkedEmailIds((prev) =>
                          prev.includes(email.id) ? prev.filter((id) => id !== email.id) : [...prev, email.id]
                        )
                      }}
                      className={`flex w-full items-start gap-2 border-b border-border/50 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50 ${linked ? 'bg-brand-50' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{email.subject || '(no subject)'}</div>
                        <div className="truncate text-muted-foreground">{email.sender}</div>
                      </div>
                      {linked && <Check className="size-3.5 shrink-0 text-brand-600" />}
                    </button>
                  )
                })
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {linkedEmails.length > 0 && (
        <div className="space-y-1">
          {linkedEmails.map((email) => (
            <div key={email.id} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
              <Mail className="size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{email.subject || '(no subject)'}</div>
                <div className="truncate text-[11px] text-muted-foreground">{email.sender}</div>
              </div>
              <button
                type="button"
                onClick={() => setLinkedEmailIds(linkedEmailIds.filter((id) => id !== email.id))}
                aria-label="Remove email link"
                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
