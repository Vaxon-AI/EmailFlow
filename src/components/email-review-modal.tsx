'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Loader2, CheckSquare, CheckCircle2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
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
  /**
   * Called only if the user explicitly ticked "Don't show again for this sync"
   * before closing. The page-level banner uses this signal to record an ack
   * keyed on the current sync batch id, so the banner stays hidden until a
   * new sync arrives.
   */
  onAcknowledgeBatch?: () => void
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

type PendingPoll = { timer: ReturnType<typeof setInterval>; timeout: ReturnType<typeof setTimeout> }

export function EmailReviewModal({ open, onClose, onAcknowledgeBatch }: Props) {
  const queryClient = useQueryClient()
  const [processing, setProcessing] = useState<Set<string>>(new Set())
  const [done, setDone] = useState<Set<string>>(new Set())
  // `extracting` is the set of emails whose task is being polled. They stay
  // visible in the list until the polled task lands (or polling times out).
  const [extracting, setExtracting] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkRunning, setBulkRunning] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [generatingCount, setGeneratingCount] = useState(0)
  const [createdCount, setCreatedCount] = useState(0)
  const [timedOutCount, setTimedOutCount] = useState(0)
  const pendingPolls = useRef<Map<string, PendingPoll>>(new Map())
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: emails = [], isLoading } = useQuery({
    queryKey: ['pending-review'],
    queryFn: fetchPendingEmails,
    enabled: open,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (open) return
    pendingPolls.current.forEach(({ timer, timeout }) => {
      clearInterval(timer)
      clearTimeout(timeout)
    })
    pendingPolls.current.clear()
    if (successTimerRef.current) clearTimeout(successTimerRef.current)
    setGeneratingCount(0)
    setCreatedCount(0)
    setTimedOutCount(0)
    setExtracting(new Set())
    setSelectedIds(new Set())
    setDontShowAgain(false)
  }, [open])

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

  // Begins polling for the linked task on a single email. Used by both the
  // per-row Extract button and the bulk "Extract selected to tasks" action.
  const startExtractPoll = useCallback((emailId: string) => {
    setGeneratingCount((c) => c + 1)
    setExtracting((prev) => new Set(prev).add(emailId))

    const timer = setInterval(async () => {
      try {
        const r = await fetch(`/api/emails/${emailId}`)
        const json = await r.json()
        if ((json?.data?.taskLinks?.length ?? 0) > 0) {
          const poll = pendingPolls.current.get(emailId)
          if (poll) { clearInterval(poll.timer); clearTimeout(poll.timeout) }
          pendingPolls.current.delete(emailId)
          setExtracting((prev) => { const next = new Set(prev); next.delete(emailId); return next })
          setGeneratingCount((c) => Math.max(0, c - 1))
          setCreatedCount((c) => c + 1)
          setDone((prev) => new Set(prev).add(emailId))
          queryClient.invalidateQueries({ queryKey: ['pending-review'] })
          queryClient.invalidateQueries({ queryKey: ['pending-review-count'] })
          if (successTimerRef.current) clearTimeout(successTimerRef.current)
          successTimerRef.current = setTimeout(() => setCreatedCount(0), 6000)
        }
      } catch { /* ignore poll errors */ }
    }, 2500)

    const timeout = setTimeout(() => {
      clearInterval(timer)
      pendingPolls.current.delete(emailId)
      setExtracting((prev) => { const next = new Set(prev); next.delete(emailId); return next })
      setGeneratingCount((c) => Math.max(0, c - 1))
      setTimedOutCount((c) => c + 1)
      setTimeout(() => setTimedOutCount((c) => Math.max(0, c - 1)), 12000)
    }, 45000)

    pendingPolls.current.set(emailId, { timer, timeout })
  }, [queryClient])

  const handleExtract = async (emailId: string) => {
    if (processing.has(emailId) || extracting.has(emailId)) return
    markProcessing(emailId, true)
    try {
      await submitReview('approve', [emailId])
      // Keep the email visible in the list while the task is being generated.
      // It will be moved to `done` only once the polled task actually lands.
      queryClient.invalidateQueries({ queryKey: ['emails'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      startExtractPoll(emailId)
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

  const visibleEmails = useMemo(() => emails.filter((e) => !done.has(e.id)), [emails, done])

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allVisibleSelected =
    visibleEmails.length > 0 && visibleEmails.every((e) => selectedIds.has(e.id))

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(visibleEmails.map((e) => e.id)))
    }
  }

  const handleBulkExtract = async () => {
    const ids = Array.from(selectedIds).filter(
      (id) => !done.has(id) && !extracting.has(id)
    )
    if (ids.length === 0 || bulkRunning) return
    setBulkRunning(true)
    try {
      // The /api/emails/review endpoint accepts an emailIds array — one
      // request for the whole batch instead of N round-trips.
      await submitReview('approve', ids)
      queryClient.invalidateQueries({ queryKey: ['emails'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setSelectedIds(new Set())
      ids.forEach((id) => startExtractPoll(id))
    } catch {
      toast.error('Failed to extract selected emails. Please try again.')
    } finally {
      setBulkRunning(false)
    }
  }

  const handleBulkDismiss = async () => {
    const ids = Array.from(selectedIds).filter((id) => !done.has(id))
    if (ids.length === 0 || bulkRunning) return
    setBulkRunning(true)
    try {
      await submitReview('ignore', ids)
      setDone((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.add(id))
        return next
      })
      setSelectedIds(new Set())
      invalidateAll()
    } catch {
      toast.error('Failed to dismiss selected emails. Please try again.')
    } finally {
      setBulkRunning(false)
    }
  }

  const handleClose = () => {
    if (done.size > 0 || extracting.size > 0) invalidateAll()
    if (dontShowAgain) onAcknowledgeBatch?.()
    onClose()
  }

  const selectedCount = Array.from(selectedIds).filter((id) => !done.has(id)).length

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Action Emails Awaiting Review</DialogTitle>
        </DialogHeader>

        {generatingCount > 0 && (
          <div className="flex items-center gap-2.5 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-2.5 text-sm text-blue-700">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
            <span>
              {generatingCount === 1
                ? 'Generating your task — this may take a moment...'
                : `Generating ${generatingCount} tasks — this may take a moment...`}
            </span>
          </div>
        )}
        {createdCount > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50/80 px-4 py-2.5 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
            <span>
              {createdCount === 1 ? 'Task created' : `${createdCount} tasks created`} — check your task list.
            </span>
          </div>
        )}
        {timedOutCount > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-sm text-amber-700">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            <span>
              {timedOutCount === 1
                ? 'Task extraction is taking longer than expected — check your task list in a moment.'
                : `${timedOutCount} tasks are taking longer than expected — check your task list in a moment.`}
            </span>
          </div>
        )}

        {!isLoading && visibleEmails.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                {selectedCount > 0 ? `${selectedCount} selected` : 'Select all'}
              </span>
            </label>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={selectedCount === 0 || bulkRunning}
                onClick={handleBulkDismiss}
                className="h-8 text-xs text-slate-600"
              >
                Dismiss selected
              </Button>
              <Button
                size="sm"
                disabled={selectedCount === 0 || bulkRunning}
                onClick={handleBulkExtract}
                className="h-8 gap-1.5 text-xs"
              >
                {bulkRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckSquare className="h-3.5 w-3.5" />}
                Extract selected to tasks
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : visibleEmails.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No emails pending review.</p>
        ) : (
          <div className="max-h-[480px] overflow-y-auto space-y-2 pr-1">
            {visibleEmails.map((email) => {
              const isExtracting = extracting.has(email.id)
              const isProcessing = processing.has(email.id) || isExtracting || bulkRunning
              const isSelected = selectedIds.has(email.id)
              return (
                <div
                  key={email.id}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 transition-colors hover:border-gray-300"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(email.id)}
                    disabled={isProcessing}
                    className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
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
                      {isExtracting || processing.has(email.id)
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

        <DialogFooter className="flex sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-100 pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Don&apos;t show this banner again for this sync</span>
          </label>
          <Button variant="outline" size="sm" onClick={handleClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
