'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InlineNotice } from '@/components/inline-notice'
import { Loader2, Shield } from 'lucide-react'
import { verifyStepUp, type StepUpAction } from '@/lib/step-up-client'

export function StepUpDialog({
  open,
  action,
  method,
  onClose,
  onVerified,
}: {
  open: boolean
  action: StepUpAction
  method: 'totp' | 'email'
  onClose: () => void
  onVerified: (token: string) => void
}) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const token = await verifyStepUp(action, code.trim())
      onVerified(token)
      setCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-brand-700" />
            Verify your identity
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <InlineNotice variant="error">{error}</InlineNotice>}
          <div className="space-y-1.5">
            <Label htmlFor="step-up-code">
              {method === 'totp'
                ? 'Enter the 6-digit code from your authenticator app'
                : 'Enter the verification code sent to your email'}
            </Label>
            <Input
              id="step-up-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              maxLength={6}
              autoComplete="one-time-code"
              inputMode="numeric"
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || code.trim().length < 4}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Verify'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
