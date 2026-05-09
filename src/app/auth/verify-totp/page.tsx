'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { AuthShell } from '@/components/auth-shell'
import { InlineNotice } from '@/components/inline-notice'
import { StatePanel } from '@/components/state-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function VerifyTotpContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tempToken = searchParams.get('token') || ''

  const [totpCode, setTotpCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/verify-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tempToken,
          totpCode,
        }),
      })

      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Verification failed')
        return
      }

      if (data.isNewDevice) {
        toast.warning('New device detected. If this wasn’t you, please secure your account.')
      }

      router.push('/dashboard')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Two-factor authentication"
      description="Enter the 6-digit code from your authenticator app."
      footer={
        <p className="text-center text-sm text-gray-500">
          <Link href="/auth/signin" className="text-brand-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      }
    >
      {!tempToken ? (
        <StatePanel
          variant="danger"
          title="Missing verification token"
          description="Please sign in again to restart two-factor verification."
          action={
            <Link href="/auth/signin">
              <Button variant="outline" size="sm">Back to sign in</Button>
            </Link>
          }
        />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {error && <InlineNotice variant="error">{error}</InlineNotice>}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Authenticator code
            </label>
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="6-digit code"
              required
              className="h-10 px-3"
            />
          </div>

          <Button type="submit" disabled={loading} className="h-10 w-full gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Verify
          </Button>
        </form>
      )}
    </AuthShell>
  )
}

export default function VerifyTotpPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <StatePanel loading title="Loading verification" description="Preparing your sign-in session." />
        </div>
      }
    >
      <VerifyTotpContent />
    </Suspense>
  )
}
