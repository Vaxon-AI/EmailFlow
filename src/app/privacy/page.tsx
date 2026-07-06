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
          <p className="mt-2 text-sm text-gray-500">Last updated: June 2026</p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-gray-700">

          <section>
            <p>
              Vaxon operates EmailFlow AI. This Privacy Policy explains what data we collect, how
              we use it, how we protect it, and what choices you have.
            </p>
            <p className="mt-3">
              EmailFlow AI is designed to help users turn email-based work into reviewable tasks,
              summaries, priorities, and workflow records.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">1. What data we collect</h2>

            <h3 className="text-sm font-semibold text-gray-800 mb-2 mt-4">Account information</h3>
            <p>When you create or use an EmailFlow AI account, we may collect:</p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>Name</li>
              <li>Email address</li>
              <li>Hashed password, if you sign up with email and password</li>
              <li>Authentication information, such as OAuth tokens, when you connect a third-party email account</li>
            </ul>

            <h3 className="text-sm font-semibold text-gray-800 mb-2 mt-4">Google user data</h3>
            <p>
              If you connect a Google account, EmailFlow AI may access Google user data only to
              provide the EmailFlow AI service. This may include:
            </p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>Gmail email content</li>
              <li>Email subject lines</li>
              <li>Sender and recipient information</li>
              <li>Email timestamps</li>
              <li>Thread IDs and email metadata</li>
              <li>Attachments or linked content only where required for the service</li>
              <li>Google account profile information, such as name and email address</li>
            </ul>
            <p className="mt-3">
              We use read-only access where possible. EmailFlow AI does not send, delete, archive,
              label, or modify your Gmail messages unless a future feature clearly asks for your
              permission and you approve that action.
            </p>

            <h3 className="text-sm font-semibold text-gray-800 mb-2 mt-4">Email-derived data</h3>
            <p>
              To provide the service, EmailFlow AI may create and store information derived from
              your emails, including:
            </p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>AI-generated task titles</li>
              <li>Task summaries</li>
              <li>Suggested due dates</li>
              <li>Priority scores</li>
              <li>Project or matter classifications</li>
              <li>Email-to-task links</li>
              <li>Review status</li>
              <li>User edits, approvals, or rejections of AI suggestions</li>
            </ul>

            <h3 className="text-sm font-semibold text-gray-800 mb-2 mt-4">Usage and technical data</h3>
            <p>We may collect limited usage and technical data, including:</p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>Actions you take in the app</li>
              <li>Sync timestamps</li>
              <li>Error logs</li>
              <li>Device, browser, and session information</li>
              <li>Performance and reliability data</li>
            </ul>
            <p className="mt-3">
              We use this information to maintain, debug, secure, and improve the service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">2. How we use your data</h2>
            <p>We use your data to provide and improve EmailFlow AI, including to:</p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>Connect to your email account</li>
              <li>Sync and display relevant email information</li>
              <li>Identify emails that may require action</li>
              <li>Extract possible tasks, due dates, priorities, and project context</li>
              <li>Generate task suggestions and summaries</li>
              <li>Help you review, edit, accept, or reject AI suggestions</li>
              <li>Maintain source links between tasks and original emails</li>
              <li>Improve reliability, security, and product performance</li>
              <li>Send service-related messages, such as account, password reset, or security notifications</li>
            </ul>
            <p className="mt-3">
              We do not use your email content to train generalized AI models. We do not sell
              your personal data. We do not use your data for advertising.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">3. How we use Google user data</h2>
            <p>
              EmailFlow AI uses Google user data only to provide user-facing features that are
              visible in the product, such as email syncing, task extraction, AI suggestions,
              task summaries, priority classification, and source-linked workflow records.
            </p>
            <p className="mt-3">
              We do not use Google user data for unrelated purposes. We do not transfer Google
              user data to third parties except where necessary to:
            </p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>Provide or improve EmailFlow AI features that you use</li>
              <li>Comply with applicable law</li>
              <li>Maintain security and prevent abuse</li>
              <li>Use service providers that help us operate the product under appropriate confidentiality and data protection obligations</li>
            </ul>
            <p className="mt-3">
              Our use and transfer of information received from Google APIs will adhere to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:underline"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">4. What we do not do</h2>
            <p>EmailFlow AI does not:</p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>Sell your Google user data</li>
              <li>Use your Google user data for advertising</li>
              <li>Use your email content to train generalized AI models</li>
              <li>Read your emails for purposes unrelated to EmailFlow AI features</li>
              <li>Send, delete, archive, label, or modify emails without a clear user-approved feature</li>
              <li>Share your email content with other users</li>
              <li>Allow humans to review your email content except where necessary for support, security, legal compliance, or with your permission</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">5. Data storage and security</h2>
            <p>
              We use reasonable technical and organizational safeguards to protect your data.
              These may include:
            </p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>Encrypted connections</li>
              <li>Secure cloud infrastructure</li>
              <li>Hashed passwords</li>
              <li>Scoped OAuth access</li>
              <li>Access controls</li>
              <li>Logging and monitoring for reliability and security</li>
            </ul>
            <p className="mt-3">
              No method of transmission or storage is completely secure. However, we take
              reasonable steps to protect your data from unauthorized access, loss, misuse, or
              disclosure.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">6. Data retention</h2>
            <p>
              We retain your data for as long as your account is active or as needed to provide
              EmailFlow AI.
            </p>
            <p className="mt-3">
              You can disconnect your email account at any time from Settings. When you disconnect
              your email account, EmailFlow AI stops syncing new emails from that account.
            </p>
            <p className="mt-3">
              If you delete your account, we will delete or de-identify your personal data within
              30 days, unless we need to retain certain information for legal, security, or
              legitimate business reasons.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">7. Your choices and rights</h2>
            <p>Depending on your location, you may have rights to:</p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>Access the personal data we hold about you</li>
              <li>Correct inaccurate information</li>
              <li>Delete your account and associated data</li>
              <li>Request a copy of your data</li>
              <li>Withdraw consent by disconnecting your email account</li>
              <li>Object to or restrict certain processing</li>
            </ul>
            <p className="mt-3">
              You can manage your connected email account in EmailFlow AI settings. You can also
              revoke Google access through your{' '}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:underline"
              >
                Google account settings
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">8. Third-party services</h2>
            <p>
              EmailFlow AI may use third-party service providers to operate the product, such as
              cloud hosting, authentication, database storage, analytics, logging, or AI
              infrastructure. These providers are used only to support the EmailFlow AI service
              and are expected to handle data under appropriate confidentiality and security
              obligations.
            </p>
            <p className="mt-3">
              EmailFlow AI may connect with Google services when you choose to sign in with Google
              or connect a Gmail account. Your use of Google services is also subject to
              Google&apos;s own terms and privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">9. International data processing</h2>
            <p>
              Your data may be processed and stored in countries other than your own. Where
              required, we take reasonable steps to protect your information in accordance with
              applicable privacy laws.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">10. Children</h2>
            <p>
              EmailFlow AI is not intended for children under 13 years old or the minimum age
              required by applicable law. We do not knowingly collect personal data from children.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">11. Changes to this Privacy Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. If we make material changes,
              we will update the &quot;Last updated&quot; date and may notify users through the app or by
              email.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">12. Contact us</h2>
            <p>
              If you have questions about this Privacy Policy or how your data is handled,
              contact us at{' '}
              <a href="mailto:support@vaxon.org" className="text-brand-600 hover:underline">
                support@vaxon.org
              </a>
            </p>
            <p className="mt-3">
              For security-related issues, contact{' '}
              <a href="mailto:support@vaxon.org" className="text-brand-600 hover:underline">
                support@vaxon.org
              </a>
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
