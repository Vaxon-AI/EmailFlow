'use client'

import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Loader2, CheckSquare } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

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
  const [processing, setProcessing] = useState<Set<string>>(new Set())
  const [done, setDone] = useState<Set<string>>(new Set())

  const { data: emails = [], isLoading } = useQuery({
    queryKey: ['pending-review'],
    queryFn: fetchPendingEmails,
    enabled: open,
  })

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['emails'] })
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['pending-review'] })
    queryClient.invalidateQueries({ queryKey: ['pending-review-count'] })
  }, [queryClient])

  const markProcessing = (id: string, active: boolean) =>
    setProcessing((prev) => {
      const next = new Set(prev)
      if (active) next.add(id)
      else next.delete(id)
      return next
    })

  const handleExtract = async (emailId: string) => {
    if (processing.has(emailId)) return
    markProcessing(emailId, true)
    try {
      await submitReview('approve', [emailId])
      setDone((prev) => new Set(prev).add(emailId))
      toast.success('Task extraction started — it will appear in your task list shortly.')
      invalidateAll()
    } catch {
      toast.error('Failed to extract task. Please try again.')
    } finally {
      markProcessing(emailId, false)
    }
  }

  const handleDismiss = async (emailId: string) => {
    if (processing.has(emailId)) return
    markProcessing(emailId, true)
    try {
      await submitReview('ignore', [emailId])
      setDone((prev) => new Set(prev).add(emailId))
      invalidateAll()
    } catch {
      toast.error('Failed to dismiss. Please try again.')
    } finally {
      markProcessing(emailId, false)
    }
  }

  const visibleEmails = emails.filter((e) => !done.has(e.id))

  const handleClose = () => {
    if (done.size > 0) invalidateAll()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Action Emails Awaiting Review</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : visibleEmails.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No emails pending review.</p>
        ) : (
          <div className="max-h-[480px] overflow-y-auto space-y-2 pr-1">
            {visibleEmails.map((email) => {
              const isProcessing = processing.has(email.id)
              return (
                <div
                  key={email.id}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 transition-colors hover:border-gray-300"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{email.subject}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className="truncate text-xs text-slate-500">{email.sender?.split('<')[0]?.trim() ?? email.sender}</p>
                      <span className="text-[10px] text-slate-300">&middot;</span>
                      <span className="shrink-0 text-xs text-slate-400">
                        {format(new Date(email.receivedAt), 'MMM d')}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isProcessing}
                      onClick={() => handleDismiss(email.id)}
                      className="h-8 text-xs text-slate-500"
                    >
                      Dismiss
                    </Button>
                    <Button
                      size="sm"
                      disabled={isProcessing}
                      onClick={() => handleExtract(email.id)}
                      className="h-8 gap-1.5 text-xs"
                    >
                      {isProcessing
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <CheckSquare className="h-3.5 w-3.5" />}
                      Extract to Task
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
