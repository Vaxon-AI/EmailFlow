'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InlineNotice } from '@/components/inline-notice'
import { KeyRound, Loader2 } from 'lucide-react'

export function PasswordCard() {
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleChangePassword() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/request-password-reset', { method: 'POST' })
      const data = await res.json()
      if (!data.success) {
        setError(data.error?.message ?? data.error ?? 'Failed to send reset email')
      } else {
        setSent(true)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-white/80 bg-white/95 shadow-sm">
      <CardHeader >
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-brand-700" />
          Change Password
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <InlineNotice variant="error">{error}</InlineNotice>}

        {sent ? (
          <InlineNotice variant="success" className="items-center">
            <div className="flex flex-1 items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Reset link sent</p>
                <p className="text-xs">Check your inbox and click the link to set a new password.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSent(false)}>
                Dismiss
              </Button>
            </div>
          </InlineNotice>
        ) : (
          <div className="flex flex-col gap-4 rounded-2xl border border-gray-200/80 bg-gray-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-semibold text-gray-900">Keep your login secure</p>
              <p className="text-sm text-gray-500">
                This flow sends a reset link to your email. Open that link to choose a new password.
              </p>
            </div>
            <Button size="sm" onClick={handleChangePassword} disabled={loading} className="self-end gap-2 sm:self-auto">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              Send reset link
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
