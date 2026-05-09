'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'

import { AuthShell } from '@/components/auth-shell'
import { InlineNotice } from '@/components/inline-notice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!token) setError('Reset link is missing or invalid. Please request a new one.')
  }, [token])

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!token) return
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword, confirmPassword }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error?.message || data.error || 'Failed to reset password')
      } else {
        setSuccess(true)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title={success ? 'Password updated' : 'Set a new password'}
      description={
        success
          ? 'You can now sign in with your new password.'
          : 'Choose a strong password for your account.'
      }
      footer={
        <p className="text-center text-sm text-gray-500">
          <Link href="/auth/signin" className="text-brand-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      }
    >
      {success ? (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm text-center">
          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-100">
              <CheckCircle2 className="h-6 w-6 text-success" />
            </div>
          </div>
          <Link href="/auth/signin">
            <Button className="h-10 w-full">Sign in</Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {error && <InlineNotice variant="error">{error}</InlineNotice>}
          {error.toLowerCase().includes('expired') ? (
            <div className="text-sm text-gray-500">
              <Link href="/auth/forgot-password" className="text-brand-600 hover:underline">
                Request a new reset link
              </Link>
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">New password</label>
            <div className="relative">
              <Input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                required
                minLength={8}
                disabled={!token}
                className="h-10 px-3 pr-11"
              />
              <button type="button" onClick={() => setShowNew((p) => !p)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                aria-label={showNew ? 'Hide' : 'Show'}>
                {showNew ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Confirm new password</label>
            <div className="relative">
              <Input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                required
                disabled={!token}
                className="h-10 px-3 pr-11"
              />
              <button type="button" onClick={() => setShowConfirm((p) => !p)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                aria-label={showConfirm ? 'Hide' : 'Show'}>
                {showConfirm ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" disabled={loading || !token} className="h-10 w-full gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Reset password
          </Button>
        </form>
      )}
    </AuthShell>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
