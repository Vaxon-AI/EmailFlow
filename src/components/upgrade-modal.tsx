'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Zap, Mail } from 'lucide-react'

const PRO_FEATURES = [
  'Unlimited email classification',
  'Unlimited manual task extraction',
  'Priority AI processing',
  'Advanced digest customization',
]

export function UpgradeModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden rounded-2xl border border-gray-200 p-0 shadow-xl">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-6 py-8 text-white">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <Zap className="h-5 w-5" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white">Upgrade to Pro</DialogTitle>
          </DialogHeader>
          <p className="mt-1 text-sm text-blue-100">
            Remove limits and unlock the full EmailFlow experience.
          </p>
        </div>

        <div className="px-6 py-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
            Everything in Free, plus
          </p>
          <ul className="space-y-3">
            {PRO_FEATURES.map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-sm text-gray-700">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" />
                {feature}
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-medium text-blue-800">Pro plan is coming soon</p>
            <p className="mt-1 text-xs text-blue-600">
              Want early access? Reach out and we'll get you set up.
            </p>
            <a
              href="mailto:support@emailflow.ai?subject=Pro plan early access"
              className="mt-3 flex items-center gap-2 text-xs font-semibold text-blue-700 hover:underline"
            >
              <Mail className="h-3.5 w-3.5" />
              Contact us for early access
            </a>
          </div>

          <Button
            className="mt-4 w-full gap-2"
            onClick={() => onOpenChange(false)}
            variant="outline"
          >
            Maybe later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
