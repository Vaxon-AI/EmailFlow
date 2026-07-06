'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react'

import { AuthShell } from '@/components/auth-shell'
import { InlineNotice } from '@/components/inline-notice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getErrorMessage } from '@/lib/api-client'

const GOOGLE_OAUTH_ERROR_MESSAGES: Record<string, string> = {
  no_email: 'Your Google account must have an email address.',
  no_provider_id: 'Google sign-in failed: missing account identifier.',
  token_exchange_failed: 'Google sign-in failed. Please try again.',
  userinfo_failed: 'Could not retrieve your Google account info. Please try again.',
  missing_access_token: 'Google sign-in failed. Please try again.',
  missing_code: 'Google sign-in was cancelled or incomplete.',
  missing_google_env: 'Google sign-in is not configured on this server.',
  server_error: 'An unexpected error occurred. Please try again.',
}

function EmailConnectionErrorReader({ onError }: { onError: (msg: string) => void }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  useEffect(() => {
    const emailConnectionError = searchParams.get('gmail_error')
    if (!emailConnectionError) return
    onError(GOOGLE_OAUTH_ERROR_MESSAGES[emailConnectionError] ?? 'Google sign-in failed. Please try again.')
    router.replace('/auth/signup', { scroll: false })
  }, [searchParams, router, onError])
  return null
}

export default function SignUpPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const passwordsDoNotMatch = confirmPassword.length > 0 && password !== confirmPassword

  function handleContinue(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    if (!email.trim()) {
      setError('Email is required')
      return
    }
    setStep(2)
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!agreedToTerms) {
      setError('Please agree to the Terms of Service to continue.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(getErrorMessage(data, 'Registration failed'))
        return
      }
      queryClient.invalidateQueries({ queryKey: ['auth-user'] })
      router.push('/dashboard')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Suspense fallback={null}>
        <EmailConnectionErrorReader onError={setError} />
      </Suspense>
      <AuthShell
        title={step === 1 ? 'Create your account' : 'Set your password'}
        description={step === 1 ? 'Free to start, no credit card needed.' : `Setting up account for ${email}`}
        footer={
          <p className="text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link href="/auth/signin" className="font-medium text-brand-600 hover:underline">
              Sign in
            </Link>
          </p>
        }
      >
        <div className="mb-4 flex items-center gap-1.5">
          <div className="h-1 w-8 rounded-full bg-brand-600" />
          <div className={`h-1 w-8 rounded-full transition-colors ${step === 2 ? 'bg-brand-600' : 'bg-gray-200'}`} />
        </div>

        {step === 1 && (
          <>
            <div className="space-y-2.5">
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

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-100" />
              <span className="text-xs text-gray-400">or continue with email</span>
              <div className="h-px flex-1 bg-gray-100" />
            </div>

            <form onSubmit={handleContinue} className="space-y-4">
              {error && <InlineNotice variant="error">{error}</InlineNotice>}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Name</label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoFocus
                  className="h-10 px-3.5"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="h-10 px-3.5"
                />
              </div>

              <Button type="submit" className="h-10 w-full">
                Continue
              </Button>
            </form>
          </>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <InlineNotice variant="error">{error}</InlineNotice>}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                  autoFocus
                  className="h-10 px-3.5 pr-11"
                />
                <button type="button" onClick={() => setShowPassword((p) => !p)}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-400 transition-colors hover:text-gray-600">
                  {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Confirm password</label>
              <div className="relative">
                <Input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  required
                  aria-invalid={passwordsDoNotMatch}
                  className="h-10 px-3.5 pr-11"
                />
                <button type="button" onClick={() => setShowConfirmPassword((p) => !p)}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-400 transition-colors hover:text-gray-600">
                  {showConfirmPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
              {passwordsDoNotMatch && (
                <p className="mt-1 text-xs text-critical">Passwords do not match</p>
              )}
            </div>

            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-600 focus:ring-blue-500"
              />
              <span className="text-xs leading-relaxed text-gray-500">
                I agree to the{' '}
                <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">Terms of Service</Link>
                {' '}and{' '}
                <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">Privacy Policy</Link>
              </span>
            </label>

            <Button
              type="submit"
              disabled={loading || !agreedToTerms}
              className="h-10 w-full gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create free account
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={() => { setStep(1); setError(''); setPassword(''); setConfirmPassword('') }}
              className="w-full gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
          </form>
        )}
      </AuthShell>
    </>
  )
}
