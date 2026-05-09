import Link from 'next/link'
import { Zap } from 'lucide-react'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="flex items-center justify-between border-b px-6 py-4">
        <Link href="/landing" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="text-base font-bold text-gray-900">EmailFlow AI</span>
        </Link>
        <Link href="/auth/signup" className="text-sm text-brand-600 hover:underline">
          Back to sign up
        </Link>
      </nav>

      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
          <p className="mt-2 text-sm text-gray-500">Last updated: April 2026</p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-gray-700">

          <section>
            <p>
              Vaxon (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates EmailFlow AI. This Privacy Policy explains what
              data we collect when you use our service, how we use it, and your rights regarding
              that data. We take privacy seriously, especially because EmailFlow AI processes
              your email content.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">1. What data we collect</h2>

            <h3 className="text-sm font-semibold text-gray-800 mb-2 mt-4">Account information</h3>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Name and email address (provided at registration)</li>
              <li>Hashed password (we never store your password in plain text)</li>
              <li>OAuth tokens used to access your email provider</li>
            </ul>

            <h3 className="text-sm font-semibold text-gray-800 mb-2 mt-4">Email data</h3>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Email metadata: subject, sender, recipients, date, thread ID</li>
              <li>Email body content: read and processed to extract tasks and summaries</li>
              <li>
                Processed outputs: AI-generated task titles, summaries, priority scores,
                and project classifications derived from your emails
              </li>
            </ul>

            <h3 className="text-sm font-semibold text-gray-800 mb-2 mt-4">Usage data</h3>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Actions you take in the app (e.g. confirming or completing tasks)</li>
              <li>Sync timestamps and error logs for service reliability</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">2. How we use your data</h2>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>To provide the EmailFlow AI service: syncing, classifying, and displaying your emails and tasks</li>
              <li>To improve reliability and debug issues</li>
              <li>To send you service-related emails (e.g. password reset, account notifications)</li>
            </ul>
            <p className="mt-3">
              We do not use your email content to train AI models. We do not sell your data.
              We do not use your data for advertising.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">3. Third-party services</h2>

            <div className="space-y-4">
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <p className="font-medium text-gray-800">AI processing</p>
                <p className="mt-1 text-gray-600">
                  To classify emails and extract tasks, email content is sent to a third-party
                  AI processing service. This provider is contractually prohibited from storing
                  or using your content to train models. Email content is processed transiently
                  and not retained by this provider.
                </p>
              </div>

              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <p className="font-medium text-gray-800">Google (Gmail)</p>
                <p className="mt-1 text-gray-600">
                  We connect to your Gmail account with read-only access. We do not store
                  your Google password. You can revoke access at any time from your{' '}
                  <a href="https://myaccount.google.com/permissions" target="_blank"
                    rel="noopener noreferrer" className="text-brand-600 hover:underline">
                    Google account settings
                  </a>.
                </p>
              </div>

              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <p className="font-medium text-gray-800">Infrastructure</p>
                <p className="mt-1 text-gray-600">
                  Your data is stored in a secure cloud database and served via a cloud
                  hosting provider. Both are enterprise-grade services with their own
                  security certifications and data protection commitments.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">4. Data retention</h2>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Your data is retained for as long as your account is active</li>
              <li>If you delete your account, your data is permanently removed from our systems within 30 days</li>
              <li>You can disconnect your Gmail at any time from Settings, which stops further email syncing</li>
              <li>Email content sent for AI processing is not retained by the processing provider</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">5. Your rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li><strong>Access</strong> - request a copy of the data we hold about you</li>
              <li><strong>Correction</strong> - ask us to correct inaccurate data</li>
              <li><strong>Deletion</strong> - delete your account and all associated data from Settings, or contact us</li>
              <li><strong>Portability</strong> - request your task data in a machine-readable format</li>
              <li><strong>Withdrawal of consent</strong> - disconnect your email account or delete your account at any time</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, contact us at{' '}
              <a href="mailto:privacy@vaxon.ai" className="text-brand-600 hover:underline">
                privacy@vaxon.ai
              </a>. We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">6. Security</h2>
            <p>
              We take reasonable measures to protect your data, including encrypted connections
              (HTTPS), hashed passwords, and scoped OAuth tokens. However, no system is completely
              secure. If you discover a security vulnerability, please report it to{' '}
              <a href="mailto:security@vaxon.ai" className="text-brand-600 hover:underline">
                security@vaxon.ai
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">7. Children</h2>
            <p>
              EmailFlow AI is not directed at children under 18. We do not knowingly collect
              data from minors. If you believe a minor has created an account, please contact us.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">8. Changes to this policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of
              significant changes via email or an in-app notice. The &quot;last updated&quot; date at the
              top of this page reflects the most recent revision.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">9. Contact</h2>
            <p>
              For any privacy-related questions or requests, contact us at{' '}
              <a href="mailto:privacy@vaxon.ai" className="text-brand-600 hover:underline">
                privacy@vaxon.ai
              </a>
              <br />
              Vaxon - Australia
            </p>
          </section>

        </div>

        <div className="mt-12 border-t pt-6 flex items-center justify-between text-xs text-gray-400">
          <span>&copy; {new Date().getFullYear()} Vaxon. All rights reserved.</span>
          <Link href="/terms" className="text-brand-600 hover:underline">Terms of Service</Link>
        </div>
      </div>
    </div>
  )
}

