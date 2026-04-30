'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getEmailClassConfig } from '@/lib/email-classification'

type PendingEmail = {
  id: string
  subject: string
  sender: string
  receivedAt: string
  classification: string | null
  classConfidence: number | null
}

type Props = {
  open: boolean
  onClose: () => void
}

async function fetchPendingEmails(): Promise<PendingEmail[]> {
  const res = await fetch('/api/emails/pending-review')
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error ?? 'Failed to fetch')
  return json.emails
}

async function submitReview(action: 'approve' | 'ignore', emailIds: string[]) {
  const res = await fetch('/api/emails/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, emailIds }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error ?? 'Failed to submit review')
  return json
}

export function EmailReviewModal({ open, onClose }: Props) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  const { data: emails = [], isLoading } = useQuery({
    queryKey: ['pending-review'],
    queryFn: fetchPendingEmails,
    enabled: open,
  })

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === emails.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(emails.map((e) => e.id)))
    }
  }

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['emails'] })
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['pending-review'] })
    queryClient.invalidateQueries({ queryKey: ['pending-review-count'] })
  }

  const handleAction = async (action: 'approve' | 'ignore', ids: string[]) => {
    if (ids.length === 0) return
    setSubmitting(true)
    try {
      await submitReview(action, ids)
      toast.success(action === 'approve' ? `${ids.length} email(s) approved — tasks will be created shortly` : `${ids.length} email(s) ignored`)
      setSelected(new Set())
      invalidateAll()
      if (emails.length - ids.length <= 0) onClose()
    } catch {
      toast.error('Failed to submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedIds = [...selected]
  const allIds = emails.map((e) => e.id)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review Synced Emails</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : emails.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No emails pending review.</p>
        ) : (
          <>
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b text-left text-xs font-medium text-slate-500">
                    <th className="pb-2 pr-3 w-8">
                      <input
                        type="checkbox"
                        checked={selected.size === emails.length && emails.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded"
                      />
                    </th>
                    <th className="pb-2 pr-3">Subject</th>
                    <th className="pb-2 pr-3 hidden sm:table-cell">Sender</th>
                    <th className="pb-2 pr-3 hidden sm:table-cell">Date</th>
                    <th className="pb-2">Classification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {emails.map((email) => {
                    const config = getEmailClassConfig(email.classification)
                    return (
                      <tr
                        key={email.id}
                        className="cursor-pointer hover:bg-slate-50/60"
                        onClick={() => toggleSelect(email.id)}
                      >
                        <td className="py-2.5 pr-3 align-middle">
                          <input
                            type="checkbox"
                            checked={selected.has(email.id)}
                            onChange={() => toggleSelect(email.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded"
                          />
                        </td>
                        <td className="py-2.5 pr-3 align-middle">
                          <span className="line-clamp-1 font-medium text-slate-800">{email.subject}</span>
                        </td>
                        <td className="py-2.5 pr-3 align-middle hidden sm:table-cell">
                          <span className="line-clamp-1 text-slate-500">{email.sender}</span>
                        </td>
                        <td className="py-2.5 pr-3 align-middle hidden sm:table-cell whitespace-nowrap">
                          <span className="text-slate-400">{format(new Date(email.receivedAt), 'MMM d')}</span>
                        </td>
                        <td className="py-2.5 align-middle">
                          <Badge className={`text-xs border ${config.color}`}>
                            {config.label}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
              <span className="text-xs text-slate-400">
                {selected.size > 0 ? `${selected.size} selected` : `${emails.length} emails`}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={submitting || selectedIds.length === 0}
                  onClick={() => handleAction('ignore', selectedIds)}
                >
                  Ignore Selected
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={submitting || selectedIds.length === 0}
                  onClick={() => handleAction('approve', selectedIds)}
                >
                  Approve Selected
                </Button>
                <Button
                  size="sm"
                  disabled={submitting || allIds.length === 0}
                  onClick={() => handleAction('approve', allIds)}
                >
                  {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Approve All
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
