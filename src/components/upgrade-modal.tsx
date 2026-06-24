'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, Zap, CheckCircle } from 'lucide-react'

const PRO_FEATURES = [
  'Unlimited email classification',
  'Unlimited Paste Text extraction',
  'Priority AI processing',
  'Advanced digest customization',
]

const FORMSPREE_ENDPOINT =
  process.env.NEXT_PUBLIC_FORMSPREE_PRO_FORM ?? 'https://formspree.io/f/xzdoyrep'

export function UpgradeModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({})

  function validate(form: HTMLFormElement) {
    const data = new FormData(form)
    const errs: typeof errors = {}
    if (!String(data.get('name')).trim()) errs.name = 'Name is required'
    const email = String(data.get('email')).trim()
    if (!email) errs.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email'
    return errs
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const errs = validate(form)
    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      })
      if (res.ok) setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setSubmitted(false)
      setErrors({})
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 overflow-hidden rounded-2xl border border-gray-200 p-0 shadow-xl">
        <div className="bg-gradient-to-br from-brand-600 to-brand-700 px-6 py-8 text-white">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <Zap className="h-5 w-5" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white">Upgrade to Pro</DialogTitle>
          </DialogHeader>
          <p className="mt-1 text-sm text-brand-100">
            Remove limits and unlock the full EmailFlow experience.
          </p>
        </div>

        {submitted ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
              <CheckCircle className="h-6 w-6 text-brand-600" />
            </div>
            <p className="text-sm font-semibold text-gray-800">Request sent!</p>
            <p className="text-sm text-gray-500">
              Thanks! We&apos;ll contact you shortly about Pro access.
            </p>
            <Button className="mt-2 w-full" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <div className="px-6 py-5">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Everything in Free, plus
            </p>
            <ul className="mb-6 space-y-3">
              {PRO_FEATURES.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm text-gray-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-600" />
                  {feature}
                </li>
              ))}
            </ul>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <input type="hidden" name="source" value="EmailFlow Pro Upgrade Modal" />

              <div className="space-y-1">
                <Label htmlFor="upgrade-name">
                  Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="upgrade-name"
                  name="name"
                  placeholder="Your name"
                  autoComplete="name"
                  aria-invalid={!!errors.name}
                />
                {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="upgrade-email">
                  Email <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="upgrade-email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  aria-invalid={!!errors.email}
                />
                {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="upgrade-workspace">Workspace name</Label>
                <Input
                  id="upgrade-workspace"
                  name="workspace"
                  placeholder="Your company or team (optional)"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="upgrade-message">Message</Label>
                <Textarea
                  id="upgrade-message"
                  name="message"
                  placeholder="Anything you'd like us to know? (optional)"
                  rows={3}
                  className="resize-none"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 gap-2" disabled={submitting}>
                  {submitting ? 'Sending…' : 'Request Pro Access'}
                </Button>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
