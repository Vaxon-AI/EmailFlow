import Link from 'next/link'
import { Zap } from 'lucide-react'

export default function TermsPage() {
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
          <h1 className="text-3xl font-bold text-gray-900">Terms of Service</h1>
          <p className="mt-2 text-sm text-gray-500">Last updated: April 2026</p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-gray-700">

          <section>
            <p>
              Welcome to EmailFlow AI, a product developed by <strong>Vaxon</strong>. EmailFlow AI
              helps users transform email-based work into reviewable tasks, summaries, priorities,
              and project workflows.
            </p>
            <p className="mt-3">
              By creating an account or using EmailFlow AI, you agree to these Terms of Service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">1. Description of the Service</h2>
            <p>
              EmailFlow AI connects to your email account using your permission. The service
              analyses your emails with AI to identify work-related tasks, due dates, priorities,
              and project context. EmailFlow AI is designed to help organise work — not to replace
              your own judgement.
            </p>
            <p className="mt-3">
              Unless a feature clearly states otherwise, EmailFlow AI uses read-only access and
              does not send, delete, archive, label, or modify your emails.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">2. Your Account</h2>
            <p>You agree to:</p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>Provide accurate account information</li>
              <li>Keep your login credentials secure</li>
              <li>Maintain control of your connected email account</li>
              <li>Use only email accounts you own or are authorised to access</li>
            </ul>
            <p className="mt-3">You remain responsible for all activity under your account.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">3. AI-generated Content</h2>
            <p>
              EmailFlow AI generates task suggestions, summaries, priority scores, and workflow
              recommendations using artificial intelligence. These outputs are automatically
              generated and may occasionally be inaccurate or incomplete.
            </p>
            <p className="mt-3">
              You are responsible for reviewing AI-generated suggestions before relying on them.
              EmailFlow AI should not be used as the sole source for business, legal, financial,
              or compliance decisions.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">4. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>Use EmailFlow AI for unlawful purposes</li>
              <li>Connect email accounts without permission</li>
              <li>Attempt to reverse engineer or abuse the platform</li>
              <li>Interfere with system security or availability</li>
              <li>Upload or process content you are not authorised to use</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">5. Third-party AI Services</h2>
            <p>
              Some EmailFlow AI features rely on third-party AI providers to analyse email content
              and generate summaries or task suggestions. These providers process data only for
              the purpose of delivering the requested EmailFlow AI features.
            </p>
            <p className="mt-3">
              EmailFlow AI does not use your Gmail content to train generalized AI models.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">6. Beta Service</h2>
            <p>
              EmailFlow AI may still be in active development. Features may change, be
              interrupted, or contain bugs. We do not guarantee uninterrupted availability or
              error-free operation.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">7. Intellectual Property</h2>
            <p>
              EmailFlow AI, its software, interface, branding, and AI workflows remain the
              property of Vaxon. Your emails and your original content remain yours. You retain
              ownership of the data you connect to the service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">8. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Vaxon is not responsible for indirect,
              incidental, consequential, or business losses arising from your use of EmailFlow AI.
              EmailFlow AI is provided &quot;as is&quot; without guarantees that every AI-generated result
              will be correct.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">9. Suspension and Termination</h2>
            <p>
              You may disconnect your email account or delete your account at any time. We may
              suspend or terminate accounts that violate these Terms or threaten the security of
              the service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">10. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. Material changes will be communicated
              through the application or by email. Continued use of EmailFlow AI after changes
              become effective constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">11. Governing Law</h2>
            <p>
              These Terms are governed by the laws of Australia. Any dispute relating to these
              Terms shall be resolved under Australian law.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">12. Contact</h2>
            <p>
              Questions regarding these Terms may be sent to{' '}
              <a href="mailto:support@vaxon.org" className="text-brand-600 hover:underline">
                support@vaxon.org
              </a>
            </p>
          </section>

        </div>

        <div className="mt-12 border-t pt-6 flex items-center justify-between text-xs text-gray-400">
          <span>&copy; {new Date().getFullYear()} Vaxon. All rights reserved.</span>
          <Link href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link>
        </div>
      </div>
    </div>
  )
}
