'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowLeft, Eye, EyeOff, Loader2, X } from 'lucide-react'

import { AuthShell } from '@/components/auth-shell'
import { InlineNotice } from '@/components/inline-notice'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

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
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null)

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
        setError(data.error || 'Registration failed')
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
      <Dialog open={legalModal !== null} onOpenChange={(open) => { if (!open) setLegalModal(null) }}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-2xl"
        >
          <DialogHeader className="flex shrink-0 flex-row items-center justify-between border-b px-6 py-4">
            <DialogTitle className="text-base font-semibold text-gray-900">
              {legalModal === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
            </DialogTitle>
            <button
              onClick={() => setLegalModal(null)}
              className="rounded-md p-1 text-gray-400 transition-colors hover:text-gray-600"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </DialogHeader>

          <div className="overflow-y-auto px-6 py-6 text-sm leading-relaxed text-gray-700">
            {legalModal === 'terms' ? (
              <div className="space-y-6">
                <p className="text-xs text-gray-400">Last updated: April 2026</p>
                <p>These Terms of Service govern your use of EmailFlow AI, a product of <strong>Vaxon</strong>. By creating an account or using the service, you agree to these terms.</p>

                <section>
                  <h2 className="mb-2 font-semibold text-gray-900">1. What EmailFlow AI does</h2>
                  <p>EmailFlow AI connects to your email account using read-only access. It uses AI to classify incoming emails, extract actionable tasks, assign priority scores, and organise work by project.</p>
                  <p className="mt-2">EmailFlow AI does not send, delete, modify, or forward any of your emails. Our access is strictly read-only.</p>
                </section>

                <section>
                  <h2 className="mb-2 font-semibold text-gray-900">2. Your account</h2>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>You must be 18 years or older to use this service.</li>
                    <li>You are responsible for keeping your login credentials secure.</li>
                    <li>You must not share your account with others or use the service on behalf of a third party without their consent.</li>
                    <li>You agree to provide accurate information when creating your account.</li>
                  </ul>
                </section>

                <section>
                  <h2 className="mb-2 font-semibold text-gray-900">3. Acceptable use</h2>
                  <p>You agree not to:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>Use the service for any unlawful purpose or in violation of applicable laws</li>
                    <li>Attempt to reverse-engineer, scrape, or abuse the service or its APIs</li>
                    <li>Connect email accounts belonging to others without their explicit permission</li>
                    <li>Use the service to process sensitive personal data of third parties without their consent</li>
                  </ul>
                </section>

                <section>
                  <h2 className="mb-2 font-semibold text-gray-900">4. Beta and availability</h2>
                  <p>EmailFlow AI is currently in early access. The service is provided as is and may change, be unavailable, or contain bugs. We do not guarantee uptime during this phase.</p>
                </section>

                <section>
                  <h2 className="mb-2 font-semibold text-gray-900">5. Intellectual property</h2>
                  <p>EmailFlow AI and all associated software, design, and content are owned by Vaxon. Your email data remains yours. We do not claim ownership of any content processed through the service.</p>
                </section>

                <section>
                  <h2 className="mb-2 font-semibold text-gray-900">6. Limitation of liability</h2>
                  <p>To the fullest extent permitted by law, Vaxon is not liable for any indirect, incidental, or consequential damages arising from your use of EmailFlow AI.</p>
                </section>

                <section>
                  <h2 className="mb-2 font-semibold text-gray-900">7. Termination</h2>
                  <p>You may stop using EmailFlow AI and delete your account at any time from Settings. We may suspend or terminate accounts that violate these terms.</p>
                </section>

                <section>
                  <h2 className="mb-2 font-semibold text-gray-900">8. Changes to these Terms</h2>
                  <p>We may update these terms from time to time. We will notify you of material changes by email or via a notice in the app.</p>
                </section>

                <section>
                  <h2 className="mb-2 font-semibold text-gray-900">9. Governing law</h2>
                  <p>These terms are governed by the laws of Australia. Any disputes shall be resolved in the courts of Australia.</p>
                </section>

                <section>
                  <h2 className="mb-2 font-semibold text-gray-900">10. Contact</h2>
                  <p>Questions about these terms? Contact us at <a href="mailto:legal@vaxon.ai" className="text-brand-600 hover:underline">legal@vaxon.ai</a></p>
                </section>
              </div>
            ) : (
              <div className="space-y-6">
                <p className="text-xs text-gray-400">Last updated: April 2026</p>
                <p>Vaxon operates EmailFlow AI. This Privacy Policy explains what data we collect, how we use it, and your rights regarding that data.</p>

                <section>
                  <h2 className="mb-2 font-semibold text-gray-900">1. What data we collect</h2>
                  <h3 className="mb-1 mt-3 font-medium text-gray-800">Account information</h3>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>Name and email address</li>
                    <li>Hashed password</li>
                    <li>OAuth tokens used to access your email provider</li>
                  </ul>
                  <h3 className="mb-1 mt-3 font-medium text-gray-800">Email data</h3>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>Email metadata: subject, sender, recipients, date, thread ID</li>
                    <li>Email body content used to extract tasks and summaries</li>
                    <li>AI-generated task titles, summaries, priority scores, and project classifications</li>
                  </ul>
                  <h3 className="mb-1 mt-3 font-medium text-gray-800">Usage data</h3>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>Actions you take in the app</li>
                    <li>Sync timestamps and error logs for reliability</li>
                  </ul>
                </section>

                <section>
                  <h2 className="mb-2 font-semibold text-gray-900">2. How we use your data</h2>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>To provide the EmailFlow AI service: syncing, classifying, and displaying your emails and tasks</li>
                    <li>To improve reliability and debug issues</li>
                    <li>To send you service-related emails such as password reset notifications</li>
                  </ul>
                  <p className="mt-3">We do not use your email content to train AI models. We do not sell your data and we do not use your data for advertising.</p>
                </section>

                <section>
                  <h2 className="mb-2 font-semibold text-gray-900">3. Third-party services</h2>
                  <div className="space-y-3">
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                      <p className="font-medium text-gray-800">AI processing</p>
                      <p className="mt-1 text-xs text-gray-600">Email content is sent to a third-party AI processing service to classify emails and extract tasks. This provider is contractually prohibited from storing or using your content to train models.</p>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                      <p className="font-medium text-gray-800">Google email</p>
                      <p className="mt-1 text-xs text-gray-600">We connect to your email account with read-only access. You can revoke access at any time from your Google account settings.</p>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                      <p className="font-medium text-gray-800">Infrastructure</p>
                      <p className="mt-1 text-xs text-gray-600">Your data is stored in a secure cloud database served via enterprise-grade hosting.</p>
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className="mb-2 font-semibold text-gray-900">4. Data retention</h2>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>Your data is retained for as long as your account is active</li>
                    <li>If you delete your account, your data is permanently removed within 30 days</li>
                    <li>You can disconnect your email at any time from Settings</li>
                  </ul>
                </section>

                <section>
                  <h2 className="mb-2 font-semibold text-gray-900">5. Your rights</h2>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>Access — request a copy of the data we hold about you</li>
                    <li>Correction — ask us to correct inaccurate data</li>
                    <li>Deletion — delete your account and all data from Settings</li>
                    <li>Portability — request your task data in a machine-readable format</li>
                    <li>Withdrawal of consent — disconnect your email account or delete your account at any time</li>
                  </ul>
                </section>

                <section>
                  <h2 className="mb-2 font-semibold text-gray-900">6. Security</h2>
                  <p>We use encrypted connections, hashed passwords, and scoped OAuth tokens. If you discover a security vulnerability, please report it to <a href="mailto:security@vaxon.ai" className="text-brand-600 hover:underline">security@vaxon.ai</a>.</p>
                </section>

                <section>
                  <h2 className="mb-2 font-semibold text-gray-900">7. Contact</h2>
                  <p>For privacy-related questions: <a href="mailto:privacy@vaxon.ai" className="text-brand-600 hover:underline">privacy@vaxon.ai</a></p>
                </section>
              </div>
            )}
          </div>

          <div className="flex shrink-0 justify-end border-t px-6 py-4">
            <Button onClick={() => setLegalModal(null)} size="sm">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                <button type="button" onClick={() => setLegalModal('terms')} className="text-brand-600 hover:underline">Terms of Service</button>
                {' '}and{' '}
                <button type="button" onClick={() => setLegalModal('privacy')} className="text-brand-600 hover:underline">Privacy Policy</button>
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
