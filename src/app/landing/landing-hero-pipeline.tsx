'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useIsMobile } from './landing-hooks'
import { Label } from './landing-shared'

type PipelinePair = {
  initial: string
  color: string
  sender: string
  subject: string
  snippet: string
  task: string
  due: string
  level: 'High' | 'Med' | 'Low'
  project: string
}

const PIPELINE_PAIRS: PipelinePair[] = [
  {
    initial: 'M',
    color: '#1E4BE0',
    sender: 'Morgan Lee',
    subject: 'Re: Q2 launch sign-off',
    snippet: '“Need your approval on the launch assets by end of day.”',
    task: 'Approve the launch assets',
    due: 'Due today',
    level: 'High',
    project: 'Q2 Launch',
  },
  {
    initial: 'P',
    color: '#7A4DE0',
    sender: 'Priya Sharma',
    subject: 'Vendor contract — redlines v3',
    snippet: '“Legal needs your read on the changes before we can sign.”',
    task: 'Review the contract changes',
    due: 'Due today',
    level: 'High',
    project: 'Acme Renewal',
  },
  {
    initial: 'D',
    color: '#1F7A4D',
    sender: 'Daniel Cho',
    subject: 'Go / no-go meeting Thursday',
    snippet: '“Can you confirm you’ll be at Thursday’s 10am?”',
    task: 'Confirm the Thursday meeting',
    due: 'Tomorrow',
    level: 'Med',
    project: 'Q2 Launch',
  },
]

const PIPELINE_LEVEL: Record<'High' | 'Med' | 'Low', { bg: string; fg: string }> = {
  High: { bg: '#FDECEA', fg: '#C23030' },
  Med: { bg: '#FEF3E0', fg: '#A07420' },
  Low: { bg: 'var(--ef-surface-2)', fg: 'var(--ef-ink-mute)' },
}

export function HeroPipeline() {
  const [step, setStep] = useState(0)
  const isMobile = useIsMobile()
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % PIPELINE_PAIRS.length), 2800)
    return () => clearInterval(id)
  }, [])
  return (
    <div
      style={{
        border: '1px solid var(--ef-line)',
        borderRadius: 20,
        background: 'var(--ef-surface)',
        padding: isMobile ? 20 : 28,
        boxShadow: '0 40px 100px rgba(10,16,36,0.08)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <Label>WATCH IT WORK</Label>
          <div className="serif" style={{ fontSize: 26, letterSpacing: '-0.02em', marginTop: 8 }}>
            Every email becomes one clear task.
          </div>
        </div>
        <div
          className="mono"
          style={{ fontSize: 12, color: 'var(--ef-signal)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, flexShrink: 0 }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: 'var(--ef-signal)',
              animation: 'landingPulseDot 1.4s infinite',
            }}
          />
          live
        </div>
      </div>

      <div style={{ position: 'relative', minHeight: isMobile ? 380 : 172 }}>
        {PIPELINE_PAIRS.map((pair, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr 96px 1fr',
              alignItems: 'center',
              gap: isMobile ? 12 : 8,
              opacity: step === i ? 1 : 0,
              transform: step === i ? 'translateY(0)' : 'translateY(10px)',
              transition: 'opacity 600ms cubic-bezier(.2,.8,.2,1), transform 600ms cubic-bezier(.2,.8,.2,1)',
              pointerEvents: step === i ? 'auto' : 'none',
            }}
          >
            <PipelineEmailCard pair={pair} />
            <PipelineConnector vertical={isMobile} />
            <PipelineTaskCard pair={pair} />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginTop: 22 }}>
        {PIPELINE_PAIRS.map((_, i) => (
          <span
            key={i}
            style={{
              width: step === i ? 22 : 7,
              height: 7,
              borderRadius: 999,
              background: step === i ? 'var(--ef-signal)' : 'var(--ef-line)',
              transition: 'all 400ms cubic-bezier(.2,.8,.2,1)',
            }}
          />
        ))}
      </div>
    </div>
  )
}

function PipelineEmailCard({ pair }: { pair: PipelinePair }) {
  return (
    <div
      style={{
        padding: '14px 16px',
        border: '1px solid var(--ef-line)',
        borderRadius: 12,
        background: 'var(--ef-surface)',
      }}
    >
      <div className="mono" style={{ fontSize: 9.5, color: 'var(--ef-ink-mute)', letterSpacing: '0.16em', marginBottom: 10 }}>
        EMAIL
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span
          className="sans"
          style={{
            width: 26,
            height: 26,
            flexShrink: 0,
            borderRadius: 999,
            background: pair.color,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {pair.initial}
        </span>
        <span className="sans" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ef-ink)' }}>
          {pair.sender}
        </span>
      </div>
      <div className="sans" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ef-ink)', marginBottom: 5 }}>
        {pair.subject}
      </div>
      <div className="sans" style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ef-ink-mute)' }}>
        {pair.snippet}
      </div>
    </div>
  )
}

function PipelineConnector({ vertical = false }: { vertical?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div
        className="mono"
        style={{ fontSize: 9, color: 'var(--ef-ink-mute)', letterSpacing: '0.12em', textAlign: 'center', lineHeight: 1.45 }}
      >
        EmailFlow
        <br />
        reads it
      </div>
      <svg width="40" height="12" viewBox="0 0 40 12" fill="none" style={vertical ? { transform: 'rotate(90deg)' } : undefined}>
        <path d="M0 6 H32" stroke="var(--ef-signal)" strokeWidth="1.5" />
        <path
          d="M30 1.5 L36 6 L30 10.5"
          stroke="var(--ef-signal)"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

function PipelineTaskCard({ pair }: { pair: PipelinePair }) {
  const lc = PIPELINE_LEVEL[pair.level]
  const chip: CSSProperties = {
    fontSize: 10.5,
    padding: '3px 9px',
    borderRadius: 999,
    border: '1px solid var(--ef-line)',
    background: 'var(--ef-surface)',
    color: 'var(--ef-ink-dim)',
  }
  return (
    <div
      style={{
        padding: '14px 16px',
        border: '1px solid var(--ef-signal)',
        borderRadius: 12,
        background: 'color-mix(in oklab, var(--ef-signal) 5%, var(--ef-surface))',
      }}
    >
      <div
        className="mono"
        style={{ fontSize: 9.5, color: 'var(--ef-signal)', letterSpacing: '0.16em', fontWeight: 600, marginBottom: 10 }}
      >
        TASK
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span
          style={{
            width: 18,
            height: 18,
            flexShrink: 0,
            marginTop: 1,
            borderRadius: 5,
            border: '2px solid var(--ef-signal)',
          }}
        />
        <div className="sans" style={{ fontSize: 14, fontWeight: 600, color: 'var(--ef-ink)', lineHeight: 1.35 }}>
          {pair.task}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
        <span className="sans" style={chip}>
          {pair.due}
        </span>
        <span
          className="sans"
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            padding: '3px 9px',
            borderRadius: 999,
            background: lc.bg,
            color: lc.fg,
          }}
        >
          {pair.level}
        </span>
        <span className="sans" style={chip}>
          {pair.project}
        </span>
      </div>
    </div>
  )
}
