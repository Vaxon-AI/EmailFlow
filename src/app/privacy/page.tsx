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
          <p className="mt-2 text-sm text-gray-500">Last updated: July 2026</p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-gray-700">

          <section>
            <p>
              Vaxon operates EmailFlow AI. This Privacy Policy explains what information we
              collect, how we use and protect it, how Google user data is handled, and the
              choices available to users.
            </p>
            <p className="mt-3">
              EmailFlow AI helps users turn email-based work into reviewable tasks, summaries,
              priorities, due-date suggestions, and source-linked workflow records. This Privacy
              Policy applies to the EmailFlow AI website, application, and related services
              (collectively, the &ldquo;Service&rdquo;).
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">1. Information we collect</h2>

            <h3 className="text-sm font-semibold text-gray-800 mb-2 mt-4">Account information</h3>
            <p>
              When you create or use an EmailFlow AI account, we collect the information needed
              to provide and secure your account, including:
            </p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>Your name and email address</li>
              <li>A securely hashed password if you register using an email address and password</li>
              <li>Authentication and session information used to sign you in and protect your account</li>
              <li>OAuth access and refresh tokens when you choose to connect a Google account</li>
            </ul>

            <h3 className="text-sm font-semibold text-gray-800 mb-2 mt-4">Google account and Gmail data</h3>
            <p>
              When you choose to connect Gmail, EmailFlow AI uses read-only Gmail access to
              provide the user-facing features described in this Policy. The Service accesses
              the following Google data when needed for those features:
            </p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>Google account profile information, including your name and email address</li>
              <li>Gmail message subject lines and relevant email body content</li>
              <li>Sender and recipient information</li>
              <li>Message dates, timestamps, thread identifiers, message identifiers, and other email metadata needed to sync, display, and link messages to tasks</li>
              <li>The Gmail account connection status and synchronization timestamps</li>
            </ul>
            <p className="mt-3">
              The current Service does not send, delete, archive, label, or otherwise modify
              Gmail messages. It does not access or process Gmail attachments as part of the
              current production service.
            </p>

            <h3 className="text-sm font-semibold text-gray-800 mb-2 mt-4">Email-derived information</h3>
            <p>
              When the Service analyses an email, it creates information derived from that email
              so the user can review and manage work. This includes:
            </p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>Suggested task titles and task summaries</li>
              <li>Suggested due dates and priority levels</li>
              <li>Project, matter, or workflow classifications</li>
              <li>Links between a task and its source email</li>
              <li>Review status and the user&apos;s edits, approvals, or rejections of suggestions</li>
            </ul>

            <h3 className="text-sm font-semibold text-gray-800 mb-2 mt-4">Usage and technical information</h3>
            <p>
              We collect limited usage and technical information that does not require us to
              analyse Gmail content, including:
            </p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>Actions taken within the Service</li>
              <li>Synchronization and processing timestamps</li>
              <li>Device, browser, session, and approximate network information</li>
              <li>Error logs, security events, latency, uptime, and other reliability information</li>
            </ul>
            <p className="mt-3">
              We use this information to operate, troubleshoot, secure, and improve the
              reliability and usability of the Service. We do not create aggregated or
              anonymized datasets from Gmail content for advertising, model training, or
              unrelated product development.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">2. How we use information</h2>
            <p>We use information only for the purposes described in this Policy, including to:</p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>Create and secure your EmailFlow AI account</li>
              <li>Connect to and synchronize your Gmail account after you authorize access</li>
              <li>Display relevant email information within the Service</li>
              <li>Identify emails that may require action</li>
              <li>Generate reviewable task suggestions, summaries, due dates, priorities, and classifications</li>
              <li>Maintain links between tasks and their source emails</li>
              <li>Allow you to review, edit, accept, reject, organize, or delete generated records</li>
              <li>Maintain, monitor, debug, and protect the Service</li>
              <li>Send account, password reset, security, and other service-related communications</li>
              <li>Comply with applicable law and respond to valid legal requests</li>
            </ul>
            <p className="mt-3">
              We do not use Google user data for advertising, credit or lending decisions, data
              brokerage, surveillance, unsolicited commercial email, email warming, or any
              purpose unrelated to the user-facing features of EmailFlow AI.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">3. Google Workspace API data and Limited Use</h2>
            <p>
              EmailFlow AI uses information received from Google Workspace APIs only to provide
              and improve user-facing features that are visible to the user, including Gmail
              synchronization, task extraction, summaries, priority classification, due-date
              suggestions, and source-linked workflow records.
            </p>
            <p className="mt-3">
              <strong>Limited Use statement:</strong> The use of information received from
              Google Workspace APIs will adhere to the{' '}
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
            <p className="mt-3">In particular, EmailFlow AI:</p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>Does not sell Google user data</li>
              <li>Does not use Google user data for advertising or personalized advertising</li>
              <li>Does not transfer Google user data to data brokers, advertisers, information resellers, credit agencies, or other parties for their independent purposes</li>
              <li>Does not use raw, derived, aggregated, or anonymized Google Workspace API user data to develop, train, or improve generalized or non-personalized artificial intelligence or machine learning models</li>
              <li>Does not transfer Google Workspace API user data to a third-party AI or machine learning provider that uses the data to train or improve generalized or non-personalized models</li>
              <li>Does not use Gmail data to send unsolicited commercial emails, warm email accounts, or operate mass-marketing or cold-email services</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">4. AI processing</h2>
            <p>
              EmailFlow AI uses automated processing to generate user-facing task suggestions
              and summaries. When a user asks the Service to analyse an email, the Service sends
              only the information needed for that analysis to contracted AI processing
              providers. Depending on the requested feature, this information can include the
              email subject, relevant portions of the email body, message context, and limited
              metadata required to produce the requested result.
            </p>
            <p className="mt-3">
              AI processing providers receive this information only as service providers acting
              on our instructions and only to deliver the requested EmailFlow AI feature. They
              are not permitted to sell the information, use it for advertising, or use Google
              Workspace API data to train or improve generalized or non-personalized AI or
              machine learning models.
            </p>
            <p className="mt-3">
              AI-generated results can be incomplete or inaccurate. EmailFlow AI presents tasks,
              summaries, priorities, and due dates as reviewable suggestions. Users are
              responsible for reviewing these suggestions before relying on them.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">5. When we disclose information</h2>
            <p>
              We do not sell personal information or Google user data. We disclose information
              only in the following limited circumstances:
            </p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>
                <strong>Service providers:</strong> to providers that perform cloud hosting,
                database storage, authentication, security, logging, email delivery, customer
                support, or AI processing on our behalf. They receive only the information
                necessary to perform their contracted function and must protect it under
                applicable confidentiality, security, and data protection obligations
              </li>
              <li>
                <strong>Legal and safety requirements:</strong> when disclosure is required by
                applicable law, a valid legal process, or is reasonably necessary to protect
                users, prevent fraud or abuse, or investigate a security incident
              </li>
              <li>
                <strong>Business changes:</strong> if Vaxon is involved in a merger,
                acquisition, financing, reorganization, or sale of assets, information may be
                transferred subject to this Policy and applicable law. Google user data will not
                be transferred for an independent purpose prohibited by the Google API Services
                User Data Policy
              </li>
              <li>
                <strong>With your direction or consent:</strong> when you explicitly ask us to
                share particular information or authorize a specific integration
              </li>
            </ul>
            <p className="mt-3">
              We do not share Gmail content with other EmailFlow AI users unless the account
              holder deliberately uses a Service feature to share a task or record and that
              feature clearly identifies what will be shared.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">6. Human access to Gmail content</h2>
            <p>
              Vaxon personnel do not routinely read Gmail content. Authorized personnel may
              access specific Gmail content only when:
            </p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>The user gives explicit consent for authorized support personnel to access specific data needed to resolve a support request</li>
              <li>Access is necessary to investigate or respond to a security incident, fraud, abuse, or a technical failure affecting the user</li>
              <li>Access is required to comply with applicable law or a valid legal process</li>
            </ul>
            <p className="mt-3">
              Any permitted access is limited to the minimum information necessary, restricted
              to authorized personnel, and subject to access controls and logging where
              technically available.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">7. Data storage and security</h2>
            <p>
              We use technical and organizational safeguards designed to protect personal
              information and Google user data. These safeguards include:
            </p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>Encryption in transit using HTTPS/TLS</li>
              <li>Encrypted cloud infrastructure and protected storage for application data and credentials</li>
              <li>Secure password hashing for accounts created with a password</li>
              <li>Scoped OAuth authorization and separation of OAuth credentials from user passwords</li>
              <li>Role-based and least-privilege access controls for production systems</li>
              <li>Logging and monitoring for suspicious activity, errors, and service reliability</li>
              <li>Restricted access to production data and secrets by authorized personnel</li>
              <li>Security review and incident response procedures appropriate to the nature of the Service</li>
            </ul>
            <p className="mt-3">
              EmailFlow AI never receives or stores your Google password. No method of
              transmission or storage is completely secure, but we take reasonable measures to
              protect information against unauthorized access, alteration, loss, misuse, or
              disclosure.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">8. Data retention and deletion</h2>

            <h3 className="text-sm font-semibold text-gray-800 mb-2 mt-4">While your account is active</h3>
            <p>
              We retain account information, OAuth credentials, synchronized Gmail information,
              and email-derived records only for as long as needed to provide the Service,
              maintain account security, and meet the purposes described in this Policy. OAuth
              access and refresh tokens are retained only while the Gmail connection remains
              active.
            </p>

            <h3 className="text-sm font-semibold text-gray-800 mb-2 mt-4">Disconnecting Gmail</h3>
            <p>
              You can disconnect Gmail from the EmailFlow AI settings at any time. When you
              disconnect Gmail:
            </p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>New Gmail synchronization stops immediately</li>
              <li>The Service revokes or deletes the stored Google OAuth access and refresh tokens as soon as technically practicable and no later than 7 days after disconnection</li>
              <li>Previously created tasks, summaries, priorities, and other email-derived records remain in your EmailFlow AI account so that you can continue using them, unless you delete them or request their deletion</li>
              <li>Previously synchronized Gmail content retained by the Service is deleted from active systems within 30 days after disconnection, unless you reconnect the account or retention is strictly required by applicable law or for a documented security investigation</li>
            </ul>

            <h3 className="text-sm font-semibold text-gray-800 mb-2 mt-4">Deleting your account or requesting deletion</h3>
            <p>
              You can delete your account through the Service where that option is available, or
              request deletion by emailing{' '}
              <a href="mailto:support@vaxon.org" className="text-brand-600 hover:underline">
                support@vaxon.org
              </a>
              . After account deletion or a verified deletion request:
            </p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>Personal information, stored Google OAuth tokens, synchronized Gmail content, and email-derived records are deleted from active systems within 30 days</li>
              <li>Residual copies may remain in encrypted backups for up to 90 days before being overwritten through the normal backup cycle</li>
              <li>Limited security, fraud-prevention, billing, or legal records may be retained only where required by applicable law or reasonably necessary to investigate a documented security incident. These records are isolated from normal product use and are not used for advertising, AI training, or unrelated purposes</li>
            </ul>

            <h3 className="text-sm font-semibold text-gray-800 mb-2 mt-4">Technical and security logs</h3>
            <p>
              Routine technical and security logs are generally retained for up to 90 days,
              unless a longer period is reasonably necessary to investigate a specific security
              incident, prevent abuse, or comply with applicable law. We avoid placing Gmail
              message content in logs unless it is technically necessary to diagnose a specific
              user-authorized issue.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">9. Your choices and rights</h2>
            <p>Depending on your location and applicable law, you may have the right to:</p>
            <ul className="list-disc space-y-1.5 pl-5 mt-2">
              <li>Access the personal information we hold about you</li>
              <li>Correct inaccurate or incomplete information</li>
              <li>Request deletion of your account, Gmail data, or email-derived records</li>
              <li>Request a portable copy of certain information</li>
              <li>Object to or restrict certain processing</li>
              <li>
                Withdraw consent by disconnecting Gmail or revoking access through your{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 hover:underline"
                >
                  Google Account settings
                </a>
              </li>
            </ul>
            <p className="mt-3">
              To exercise a privacy right or request deletion, contact{' '}
              <a href="mailto:support@vaxon.org" className="text-brand-600 hover:underline">
                support@vaxon.org
              </a>
              . We may need to verify your identity before completing a request. We will respond
              within the period required by applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">10. Third-party services</h2>
            <p>
              EmailFlow AI relies on service providers to operate the Service, including
              providers of cloud infrastructure, database storage, authentication, security,
              logging, email delivery, customer support, and AI processing. These providers
              process information only to perform services for Vaxon and are subject to
              applicable contractual or service-term restrictions concerning confidentiality,
              security, retention, and data use.
            </p>
            <p className="mt-3">
              When you connect a Google account, your use of Google services is also governed by
              Google&apos;s own terms and privacy policies. You can review and revoke EmailFlow
              AI&apos;s access from the third-party access section of your Google Account.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">11. International data processing</h2>
            <p>
              Information may be processed or stored in countries other than the country in
              which you live. Where required, we use reasonable safeguards designed to ensure
              that personal information remains protected in accordance with this Policy and
              applicable privacy law.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">12. Children</h2>
            <p>
              EmailFlow AI is not directed to children under 13 years of age or the minimum age
              required to use the Service under applicable law. We do not knowingly collect
              personal information from children. If you believe a child has provided personal
              information, contact{' '}
              <a href="mailto:support@vaxon.org" className="text-brand-600 hover:underline">
                support@vaxon.org
              </a>{' '}
              so that we can investigate and delete it where appropriate.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">13. Changes to this Privacy Policy</h2>
            <p>
              We may update this Privacy Policy to reflect changes to the Service, legal
              requirements, security practices, or data handling. If we make a material change,
              we will update the &ldquo;Last updated&rdquo; date and provide notice through the
              Service, by email, or by another appropriate method before the change takes effect
              where required.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">14. Contact us</h2>
            <p>
              For privacy questions, deletion requests, security concerns, or other questions
              about this Policy, contact:{' '}
              <a href="mailto:support@vaxon.org" className="text-brand-600 hover:underline">
                support@vaxon.org
              </a>
            </p>
            <p className="mt-3">
              This Policy describes EmailFlow AI&apos;s current production data practices.
              Features and permissions not currently offered are not covered as active
              capabilities.
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
