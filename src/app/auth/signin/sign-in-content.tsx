'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { AuthShell } from '@/components/auth-shell'
import { InlineNotice } from '@/components/inline-notice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function SignInContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const reason = searchParams.get('reason')

    if (reason === 'SESSION_EXPIRED' || reason === 'SESSION_INACTIVE_EXPIRED') {
      setError('Your session has expired. Please sign in again.')
      return
    }

    if (reason === 'SESSION_REVOKED') {
      setError('This session is no longer valid. Please sign in again.')
    }
  }, [searchParams])

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe }),
      })

      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Login failed')
        return
      }

      if (data.requiresTwoFactor) {
        router.push(`/auth/verify-totp?token=${encodeURIComponent(data.tempToken)}`)
        return
      }

      // Set user in cache immediately so DashboardLayout sees isAuthenticated=true
      // before the background refetch completes. Without this, the cache still
      // holds null from the post-logout refetch and the dashboard redirects away.
      queryClient.setQueryData(['auth-user'], data.data)
      if (data.isNewDevice) {
      toast.warning("New device detected. If this wasn't you, please secure your account.")
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
      title="Welcome back"
      description="Sign in to your account to continue"
      footer={
        <p className="text-center text-sm text-gray-500">
          Don&apos;t have an account?{' '}
          <Link href="/auth/signup" className="font-medium text-blue-600 hover:underline">
            Create one
          </Link>
        </p>
      }
    >
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 space-y-2.5">
          <a
            href="/api/auth/google"
            className="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span className="flex-1">Continue with Google</span>
          </a>
          <div className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5 text-sm text-gray-400">
            <span className="flex-1">Continue with Microsoft</span>
            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-500">Coming soon</span>
          </div>

          <div className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5 text-sm text-gray-400">
            <span className="flex-1">Continue with Apple</span>
            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-500">Coming soon</span>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-100" />
          <span className="text-xs text-gray-400">or continue with email</span>
          <div className="h-px flex-1 bg-gray-100" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Password</label>
            <Link href="/auth/forgot-password" className="text-xs text-blue-600 hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              className="h-10 px-3 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <label className="flex cursor-pointer select-none items-center gap-2.5">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-600">Remember me for 30 days</span>
        </label>

        <Button type="submit" disabled={loading} className="h-10 w-full gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Sign in
        </Button>
        </form>
      </div>
    </AuthShell>
  )
}
