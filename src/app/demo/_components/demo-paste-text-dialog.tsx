'use client'

// Demo-only dialog that explains why "Paste Text → AI extract" can't run
// in the demo workspace. The real product (dashboard/tasks) ships a textarea
// + /api/tasks/from-text call that returns LLM-suggested TaskDrafts; the
// demo's hard constraint is zero AI / API, so we replace that surface with
// this one-shot info dialog. See plan §5.

import { AlertCircle, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function DemoPasteTextDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-warning" />
            Paste Text → Tasks (AI)
          </DialogTitle>
          <DialogDescription>
            This feature uses live AI extraction, which the demo workspace can&apos;t run.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-6 text-slate-600">
          <div className="flex gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="space-y-2">
              <p>
                In the real product you can paste meeting notes, an email body, or any free text into a
                textarea. EmailFlow calls an LLM (<code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-700">/api/tasks/from-text</code>)
                and returns a stack of task drafts — title, urgency, impact, deadline — ready for you to
                review and create in one go.
              </p>
              <p>
                The demo runs entirely client-side with no API or AI calls, so this surface is disabled
                here.
              </p>
              <p className="text-xs text-slate-500">
                Want to see something close? Open an email in the demo inbox and click{' '}
                <strong>Extract to Task</strong> — that one runs a pre-written extraction with a
                simulated &ldquo;thinking&rdquo; delay.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
