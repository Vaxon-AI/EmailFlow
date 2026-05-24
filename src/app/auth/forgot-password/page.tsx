'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2 } from 'lucide-react'

import { AuthShell } from '@/components/auth-shell'
import { InlineNotice } from '@/components/inline-notice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getErrorMessage } from '@/lib/api-client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(getErrorMessage(data, 'Something went wrong'))
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
    <AuthShell
      title={sent ? 'Check your inbox' : 'Reset your password'}
      description={
        sent
          ? `We've sent a reset link to ${email}. It expires in 1 hour.`
          : "Enter your email and we'll send you a reset link."
      }
      footer={
        <p className="text-center text-sm text-gray-500">
          <Link href="/auth/signin" className="text-brand-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      }
    >
      {sent ? (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm text-center">
          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-100">
              <CheckCircle2 className="h-6 w-6 text-success" />
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Didn&apos;t receive it?{' '}
            <button
              type="button"
              onClick={() => { setSent(false); setEmail('') }}
              className="text-brand-600 hover:underline"
            >
              Try a different email
            </button>
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {error && <InlineNotice variant="error">{error}</InlineNotice>}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              className="h-10 px-3"
            />
          </div>

          <Button type="submit" disabled={loading} className="h-10 w-full gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
