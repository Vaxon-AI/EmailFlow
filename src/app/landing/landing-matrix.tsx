'use client'

import { useRef } from 'react'
import { clamp, useProgress } from './landing-hooks'
import { Label } from './landing-shared'

export function CineMatrix() {
  const ref = useRef<HTMLElement>(null)
  const p = useProgress(ref)
  const feats = [
    { k: 'Finds your to-dos', d: 'Reads plain, messy emails and pulls out what you actually need to do.' },
    { k: 'Keeps threads together', d: 'Emails about the same thing stay grouped, so you see the whole story.' },
    { k: "Knows what's urgent", d: 'Sorts tasks by deadline and importance, so the one on top is the right one.' },
    { k: 'One morning summary', d: 'A single recap of what needs you, instead of checking email all day.' },
    { k: 'Clears the clutter', d: 'Old and unimportant email fades away on its own. You keep what matters.' },
    { k: 'Read-only and safe', d: 'EmailFlow can only read your inbox — never send, delete, or change a thing.' },
  ]
  return (
    <section ref={ref} style={{ padding: '96px 36px' }}>
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
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 0,
            borderTop: '1px solid var(--ef-line)',
            borderLeft: '1px solid var(--ef-line)',
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
      </div>
    </section>
  )
}
