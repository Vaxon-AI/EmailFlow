'use client'

import { useRef } from 'react'
import { clamp, useProgress } from './landing-hooks'
import { Label } from './landing-shared'

export function CineMetrics() {
  const ref = useRef<HTMLElement>(null)
  const p = useProgress(ref)
  const rows: Array<[string, string]> = [
    [
      'Open your inbox and scan dozens of threads to work out what matters.',
      'Open one short list — the most important thing is already on top.',
    ],
    [
      'Hope you did not miss a request buried three replies deep.',
      'Every request and deadline is pulled out and shown to you.',
    ],
    [
      'Keep your inbox open all day, just in case something needs you.',
      'Read one morning summary, then close it and get on with your day.',
    ],
  ]
  return (
    <section
      ref={ref}
      style={{
        padding: '96px 36px',
        background: 'var(--ef-surface)',
        borderTop: '1px solid var(--ef-line-soft)',
        borderBottom: '1px solid var(--ef-line-soft)',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 56 }}>
          <Label>WHY IT HELPS</Label>
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
            Get your morning back.
          </h2>
        </div>
        <div style={{ borderTop: '1px solid var(--ef-line)' }}>
          {rows.map(([before, after], i) => {
            const on = clamp((p - 0.05 - i * 0.1) * 6)
            return (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 40px 1fr',
                  gap: 20,
                  alignItems: 'center',
                  padding: '32px 0',
                  borderBottom: '1px solid var(--ef-line)',
                  opacity: on,
                  transform: `translateY(${(1 - on) * 16}px)`,
                }}
              >
                <div>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--ef-ink-mute)', letterSpacing: '0.14em', marginBottom: 8 }}>
                    BEFORE
                  </div>
                  <p className="sans" style={{ fontSize: 16, lineHeight: 1.5, color: 'var(--ef-ink-mute)', margin: 0 }}>
                    {before}
                  </p>
                </div>
                <div style={{ textAlign: 'center', color: 'var(--ef-signal)', fontSize: 22 }}>→</div>
                <div>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--ef-signal)', letterSpacing: '0.14em', marginBottom: 8 }}>
                    WITH EMAILFLOW
                  </div>
                  <p className="sans" style={{ fontSize: 16, lineHeight: 1.5, color: 'var(--ef-ink)', margin: 0, fontWeight: 500 }}>
                    {after}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
