'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InlineNotice } from '@/components/inline-notice'
import { Loader2, Shield, ShieldOff } from 'lucide-react'
import { toast } from 'sonner'
import { requestStepUp } from '@/lib/step-up-client'
import { StepUpDialog } from './settings-step-up-dialog'

export function TwoFactorCard({ totpEnabled, onDisabled }: { totpEnabled: boolean; onDisabled: () => void }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [method, setMethod] = useState<'totp' | 'email'>('email')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleRequestDisable() {
    setError('')
    setLoading(true)
    try {
      const { method: m } = await requestStepUp('disable_totp')
      setMethod(m)
      setDialogOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start verification')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerified(token: string) {
    setDialogOpen(false)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/totp/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepUpToken: token }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error?.message ?? data.error ?? 'Failed to disable 2FA')
      toast.success('Two-factor authentication disabled')
      onDisabled()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable 2FA')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Card className="border-white/80 bg-white/95 shadow-sm">
        <CardHeader >
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-brand-700" />
            Two-Factor Authentication
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <InlineNotice variant="error">{error}</InlineNotice>}
          <div className="flex flex-col gap-4 rounded-2xl border border-gray-200/80 bg-gray-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-900">Authenticator app (TOTP)</p>
                {totpEnabled ? (
                  <Badge className="bg-success-100 text-success hover:bg-success-100">Enabled</Badge>
                ) : (
                  <Badge variant="outline">Disabled</Badge>
                )}
              </div>
              <p className="text-sm text-gray-500">
                {totpEnabled
                  ? 'Your account is protected with a time-based one-time password.'
                  : 'Add an extra layer of security with an authenticator app.'}
              </p>
            </div>
            {totpEnabled ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRequestDisable}
                disabled={loading}
                className="gap-2 self-end border-critical-100 text-critical-700 hover:bg-critical-50 hover:text-critical-700 sm:self-auto"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />}
                Disable 2FA
              </Button>
            ) : (
              <a href="/auth/totp-setup" className="self-end sm:self-auto">
                <Button size="sm" className="gap-2">
                  <Shield className="h-3.5 w-3.5" />
                  Enable 2FA
                </Button>
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      <StepUpDialog open={dialogOpen} action="disable_totp" method={method} onClose={() => setDialogOpen(false)} onVerified={handleVerified} />
    </>
  )
}
