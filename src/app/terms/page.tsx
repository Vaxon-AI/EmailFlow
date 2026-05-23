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

        <div className="prose prose-gray max-w-none space-y-8 text-sm leading-relaxed text-gray-700">

          <section>
            <p>
              These Terms of Service (&quot;Terms&quot;) govern your use of EmailFlow AI, a product of{' '}
              <strong>Vaxon</strong> (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). By creating an account or using our
              service, you agree to these Terms. If you do not agree, please do not use EmailFlow AI.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">1. What EmailFlow AI does</h2>
            <p>
              EmailFlow AI connects to your email account (currently Google, with more providers
              planned) using read-only OAuth access. It uses artificial intelligence to classify
              incoming emails, extract actionable tasks, assign priority scores, and organise work
              by project. You can view, activate, complete, or delete these tasks from a dashboard.
            </p>
            <p className="mt-3">
              EmailFlow AI does not send, delete, modify, or forward any of your emails. Our access
              is strictly read-only.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">2. Your account</h2>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>You must be 18 years or older to use this service.</li>
              <li>You are responsible for keeping your login credentials secure.</li>
              <li>You must not share your account with others or use the service on behalf of a third party without their consent.</li>
              <li>You agree to provide accurate information when creating your account.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">3. Acceptable use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>Use the service for any unlawful purpose or in violation of any applicable laws</li>
              <li>Attempt to reverse-engineer, scrape, or abuse the service or its APIs</li>
              <li>Connect email accounts belonging to others without their explicit permission</li>
              <li>Use the service to process sensitive personal data of third parties without their consent</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">4. Beta and availability</h2>
            <p>
              EmailFlow AI is currently in early access (MVP/Beta). The service is provided &quot;as is&quot;
              and may change, be unavailable, or contain bugs. We do not guarantee uptime or
              uninterrupted access during this phase.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">5. Intellectual property</h2>
            <p>
              EmailFlow AI and all associated software, design, and content are owned by Vaxon.
              Your email data remains yours. We do not claim ownership of any content processed
              through the service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">6. Limitation of liability</h2>
            <p>
              To the fullest extent permitted by law, Vaxon is not liable for any indirect,
              incidental, or consequential damages arising from your use of EmailFlow AI,
              including but not limited to loss of data, missed tasks or deadlines, or business
              disruption. Our total liability to you shall not exceed the amount you paid us in
              the 12 months preceding the claim (which may be zero during the free beta period).
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">7. Termination</h2>
            <p>
              You may stop using EmailFlow AI and delete your account at any time from Settings.
              We may suspend or terminate accounts that violate these Terms. Upon account deletion,
              your data will be removed from our systems within 30 days, except where retention is
              required by law.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">8. Changes to these Terms</h2>
            <p>
              We may update these Terms from time to time. We will notify you of material changes
              by email or via a notice in the app. Continued use of the service after changes take
              effect constitutes your acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">9. Governing law</h2>
            <p>
              These Terms are governed by the laws of Australia. Any disputes shall be resolved
              in the courts of Australia.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">10. Contact</h2>
            <p>
              Questions about these Terms? Contact us at{' '}
              <a href="mailto:legal@vaxon.ai" className="text-brand-600 hover:underline">
                legal@vaxon.ai
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
