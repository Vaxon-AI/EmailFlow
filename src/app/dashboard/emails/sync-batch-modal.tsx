'use client'

import Link from 'next/link'
import { CheckSquare, Zap } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatEmailDate, type BatchStatus } from './email-page-types'

export function SyncBatchModal({
  batchStatus,
  onClose,
}: {
  batchStatus: BatchStatus
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-warning" />
            {batchStatus.actionEmailCount} Action Email{batchStatus.actionEmailCount === 1 ? '' : 's'} — Last Sync
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-500">
          These emails were classified as <span className="font-medium text-gray-700">Action</span> during the latest sync.
          Emails with a linked task were handled automatically.
        </p>

        <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
          {batchStatus.actionEmails.map((email) => {
            const linkedTasks = email.taskLinks
              .map((link) => link.task)
              .filter((task): task is { id: string; title: string } => task != null)

            return (
              <Link
                key={email.id}
                href={`/dashboard/emails/${email.id}`}
                onClick={onClose}
                className="flex items-start gap-3 rounded-xl border border-gray-200/80 bg-white px-4 py-3 text-left transition-all hover:border-brand-200 hover:bg-brand-50/60 hover:shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {email.subject || '(no subject)'}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="truncate text-xs text-gray-500">
                      {email.sender?.split('<')[0]?.trim() || email.sender}
                    </p>
                    <span className="text-[10px] text-gray-300">&middot;</span>
                    <p className="shrink-0 text-xs text-gray-400">
                      {formatEmailDate(email.receivedAt)}
                    </p>
                  </div>
                </div>

                <div className="shrink-0">
                  {linkedTasks.length > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-600">
                      <CheckSquare className="h-2.5 w-2.5" />
                      Task created
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md border border-warning-200 bg-warning-100/60 px-2 py-0.5 text-[10px] font-medium text-warning-700">
                      No task yet
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
