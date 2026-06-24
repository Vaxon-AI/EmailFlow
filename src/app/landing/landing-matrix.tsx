'use client'

import { useState, useRef } from 'react'
import { clamp, useIsMobile, useProgress } from './landing-hooks'
import { Label } from './landing-shared'
import { Plus } from 'lucide-react'

const FAQ_DATA = [
  {
    category: 'Product Basics',
    questions: [
      {
        q: 'What is EmailFlow AI?',
        a: 'EmailFlow AI is an AI email workflow tool that helps turn email communication into clear tasks, priorities, deadlines, and next actions. It is designed for people who manage work through email and need a clearer way to see what needs action.',
      },
      {
        q: 'Who is EmailFlow AI built for?',
        a: 'EmailFlow AI is built for people whose work starts in email. This includes professionals, students, freelancers, small business owners, and anyone managing multiple projects, deadlines, follow-ups, or inboxes.',
      },
      {
        q: 'How is EmailFlow AI different from a normal inbox or a to-do list?',
        a: 'A normal inbox shows messages by time. A normal to-do list relies on users to add tasks manually. EmailFlow AI connects the two. It finds tasks, deadlines, and follow-ups inside email threads, then turns them into reviewable tasks with the original context attached.',
      },
    ],
  },
  {
    category: 'How It Works',
    questions: [
      {
        q: 'How does EmailFlow AI turn emails into tasks?',
        a: 'EmailFlow AI reads email threads, identifies real requests and action items, then turns them into structured tasks. Each task can include useful context such as the original email, deadline, priority, and related project information.',
      },
      {
        q: 'What is text to task?',
        a: 'Text to task means users can paste written communication into EmailFlow AI and turn it into structured tasks. This can be useful for meeting notes, messages, copied instructions, or any written request that needs to become an action.',
      },
      {
        q: 'Can I review AI-suggested tasks before accepting them?',
        a: 'Yes. EmailFlow AI is built around reviewable AI suggestions. Users can check, edit, and decide whether a suggested task should become active work.',
      },
      {
        q: 'How does EmailFlow AI decide what is important?',
        a: 'EmailFlow AI looks for work signals such as deadlines, urgency, task type, sender context, and whether the message requires action. It then helps users identify which tasks may need attention first.',
      },
    ],
  },
  {
    category: 'Access & Integrations',
    questions: [
      {
        q: 'Which email platforms are supported?',
        a: 'EmailFlow AI currently supports Gmail connection, helping users turn Gmail messages into reviewable tasks with source context attached. We are planning to support more email platforms, including Outlook, Apple and Microsoft 365, as EmailFlow AI develops. Users can also create tasks manually with text to task by copying and pasting email content, notes, or messages without connecting an inbox.',
      },
      {
        q: 'How do I start using EmailFlow AI?',
        a: 'You can start by creating an EmailFlow AI account and choosing how you want to create tasks. You can connect your Gmail account to let EmailFlow AI identify task suggestions from your inbox or use text to task by pasting email content directly into the product. EmailFlow AI then helps turn emails into tasks, suggest priority, and keep the original source context attached. AI-suggested tasks stay reviewable before they become active tasks.',
      },
    ],
  },
  {
    category: 'Privacy & Data Control',
    questions: [
      {
        q: 'Does EmailFlow AI send, delete, or modify emails?',
        a: 'No. EmailFlow AI is designed as an AI email task manager, not an email sending or inbox control tool. By default, EmailFlow AI does not send, delete, archive, or modify your emails. It helps analyse email signals, suggest tasks, and organise inbox-driven work while keeping AI suggestions separate from active tasks until you review them.',
      },
      {
        q: 'What email data does EmailFlow AI access?',
        a: 'EmailFlow AI accesses the email information needed to provide email to task features, such as email content, subject lines, sender information, timestamps, and relevant message context. This information helps EmailFlow AI detect requests, deadlines, follow-ups, approvals, and other work signals so it can suggest tasks, priorities, and source-linked context.',
      },
      {
        q: 'Do you use my emails to train AI models?',
        a: 'No. EmailFlow AI does not use your emails to train public AI models. Your email content is used to provide the features you choose to use, such as AI task suggestions, email workflow automation, task prioritisation, and source-linked context inside your workspace.',
      },
      {
        q: 'Can I disconnect my email account and delete my data?',
        a: 'Yes. You can disconnect your email account at any time. After disconnection, EmailFlow AI will no longer access new emails from that account. You can also request deletion of your account data through product settings or by contacting support. Some data may be retained only where required for legal, security, or operational reasons.',
      },
    ],
  },
]

export function CineMatrix() {
  const ref = useRef<HTMLElement>(null)
  const p = useProgress(ref)
  const isMobile = useIsMobile()
  const [openCategory, setOpenCategory] = useState<string | null>(null)

  const feats = [
    { k: 'Finds your to-dos', d: 'Reads plain, messy emails and pulls out what you actually need to do.' },
    { k: 'Keeps threads together', d: 'Emails about the same thing stay grouped, so you see the whole story.' },
    { k: "Knows what's urgent", d: 'Sorts tasks by deadline and importance, so the one on top is the right one.' },
    { k: 'One morning summary', d: 'A single recap of what needs you, instead of checking email all day.' },
    { k: 'Clears the clutter', d: 'Old and unimportant email fades away on its own. You keep what matters.' },
    { k: 'Read-only and safe', d: 'EmailFlow can only read your inbox — never send, delete, or change a thing.' },
  ]

  return (
    <section ref={ref} style={{ padding: isMobile ? '64px 20px' : '96px 36px' }}>
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>
        <div style={{ marginBottom: 72 }}>
          <Label>WHAT IT DOES</Label>
          <h2
            className="serif"
            style={{
              fontSize: 'clamp(44px, 5.4vw, 80px)',
              lineHeight: 1,
              letterSpacing: '-0.03em',
              margin: '18px 0 0',
              fontWeight: 400,
            }}
          >
            Everything it does
            <br />
            for you.
          </h2>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
            gap: 0,
            borderTop: '1px solid var(--ef-line)',
            borderLeft: '1px solid var(--ef-line)',
            marginBottom: isMobile ? 80 : 120,
          }}
        >
          {feats.map((f, i) => {
            const delay = i * 0.08
            const on = clamp((p - 0.05 - delay) * 6)
            return (
              <div
                key={f.k}
                style={{
                  padding: '44px 36px 48px',
                  borderRight: '1px solid var(--ef-line)',
                  borderBottom: '1px solid var(--ef-line)',
                  opacity: on,
                  transform: `translateY(${(1 - on) * 20}px)`,
                  transition: 'none',
                }}
              >
                <div className="mono" style={{ fontSize: 12, color: 'var(--ef-signal)', fontWeight: 600 }}>
                  {String(i + 1).padStart(2, '0')}
                </div>
                <h3
                  className="serif"
                  style={{ fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', margin: '14px 0 14px' }}
                >
                  {f.k}
                </h3>
                <p
                  className="sans"
                  style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--ef-ink-dim)', margin: 0 }}
                >
                  {f.d}
                </p>
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 120, margin: '120px auto 0' }}>
          <Label>QUESTIONS & ANSWERS</Label>
          <h2
            className="serif"
            style={{
              fontSize: 'clamp(32px, 4vw, 48px)',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              margin: '18px 0 64px',
              fontWeight: 400,
            }}
          >
            Commonly asked
            <br />
            questions.
          </h2>

          <div style={{ borderTop: '1px solid var(--ef-line)' }}>
            {FAQ_DATA.map((cat) => {
              const isOpen = openCategory === cat.category
              return (
                <div key={cat.category} style={{ borderBottom: '1px solid var(--ef-line)' }}>
                  <button
                    onClick={() => setOpenCategory(isOpen ? null : cat.category)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '32px 12px',
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.02)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span
                      className="serif"
                      style={{ fontSize: 24, fontWeight: 400, letterSpacing: '-0.01em', color: 'var(--ef-ink)' }}
                    >
                      {cat.category}
                    </span>
                    <div
                      style={{
                        transform: `rotate(${isOpen ? 45 : 0}deg)`,
                        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        color: isOpen ? 'var(--ef-signal)' : 'var(--ef-ink-dim)',
                      }}
                    >
                      <Plus size={24} strokeWidth={1.5} />
                    </div>
                  </button>

                  <div
                    style={{
                      maxHeight: isOpen ? '2000px' : '0px',
                      overflow: 'hidden',
                      transition: 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease',
                      opacity: isOpen ? 1 : 0,
                    }}
                  >
                    <div style={{ padding: '0 12px 48px' }}>
                      {cat.questions.map((q, i) => (
                        <div key={i} style={{ marginBottom: i === cat.questions.length - 1 ? 0 : 32 }}>
                          <h4
                            className="sans"
                            style={{
                              fontSize: 16,
                              fontWeight: 600,
                              color: 'var(--ef-ink)',
                              marginBottom: 8,
                              letterSpacing: '-0.01em',
                            }}
                          >
                            {q.q}
                          </h4>
                          <p
                            className="sans"
                            style={{
                              fontSize: 15,
                              lineHeight: 1.6,
                              color: 'var(--ef-ink-dim)',
                              margin: 0,
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {q.a}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 64, textAlign: 'center', paddingBottom: 48 }}>
            <p className="sans" style={{ fontSize: 14, color: 'var(--ef-ink-dim)' }}>
              More Questions?{' '} Need more help?{' '}
              <a
                href="mailto:support@emailflow.ai"
                style={{ color: 'var(--ef-signal)', fontWeight: 600, textDecoration: 'none' }}
              >
                Contact us.
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
