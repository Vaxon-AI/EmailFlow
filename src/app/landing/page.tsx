'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import './landing-tokens.css'

// ---------- Scroll primitives ----------

function useScrollY() {
  const [y, setY] = useState(0)
  useEffect(() => {
    let raf = 0
    const on = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setY(window.scrollY))
    }
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return y
}

function useProgress(ref: RefObject<HTMLElement | null>) {
  // Returns 0→1 progress based on element position vs viewport
  const [p, setP] = useState(0)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const el = ref.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const vh = window.innerHeight
        const total = r.height + vh
        const scrolled = vh - r.top
        setP(Math.max(0, Math.min(1, scrolled / total)))
      })
    }
    window.addEventListener('scroll', tick, { passive: true })
    window.addEventListener('resize', tick)
    tick()
    return () => {
      window.removeEventListener('scroll', tick)
      window.removeEventListener('resize', tick)
    }
  }, [ref])
  return p
}

function clamp(v: number, a = 0, b = 1) {
  return Math.max(a, Math.min(b, v))
}

// ---------- Top-level page ----------

export default function LandingPage() {
  // overflow-x: clip clips horizontal overflow from hero decorations without
  // creating a scroll container — unlike overflow: hidden, it does NOT break
  // position: sticky on descendants (CinePinnedStory pins its inner panel).
  return (
    <div className="landing-cine" style={{ overflowX: 'clip' }}>
      <CineNav />
      <CineHero />
      <CinePinnedStory />
      <CineMetrics />
      <CineMatrix />
      <CineCTA />
      <CineFooter />
    </div>
  )
}

// ---------- Nav ----------

function CineNav() {
  const y = useScrollY()
  const scrolled = y > 20
  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        transition: 'all 300ms cubic-bezier(.2,.8,.2,1)',
        background: scrolled ? 'rgba(244,246,251,0.82)' : 'transparent',
        backdropFilter: scrolled ? 'blur(18px)' : 'none',
        borderBottom: scrolled ? '1px solid var(--ef-line-soft)' : '1px solid transparent',
      }}
    >
      <div
        style={{
          maxWidth: 1360,
          margin: '0 auto',
          padding: '18px 36px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Link href="/landing" style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'inherit', textDecoration: 'none' }}>
          <LogoMark />
          <span className="sans" style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
            EmailFlow AI
          </span>
        </Link>
        <nav style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
          <Link
            href="/demo"
            className="sans"
            style={{ fontSize: 13.5, color: 'var(--ef-ink-dim)', textDecoration: 'none' }}
          >
            Live demo
          </Link>
          <Link
            href="/auth/signin"
            className="sans"
            style={{ fontSize: 13.5, color: 'var(--ef-ink-dim)', textDecoration: 'none' }}
          >
            Sign in
          </Link>
          <Link
            href="/auth/signup"
            className="sans"
            style={{
              fontSize: 13.5,
              padding: '9px 18px',
              background: 'var(--ef-signal)',
              color: '#fff',
              borderRadius: 999,
              fontWeight: 500,
              boxShadow: '0 1px 2px rgba(30,75,224,0.2), 0 8px 24px rgba(30,75,224,0.15)',
              textDecoration: 'none',
            }}
          >
            Connect Gmail
          </Link>
        </nav>
      </div>
    </header>
  )
}

function LogoMark() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: 10,
        background: 'var(--ef-signal)',
        boxShadow: '0 1px 2px rgba(30,75,224,0.25), 0 6px 16px rgba(30,75,224,0.18)',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    </span>
  )
}

// ---------- Hero ----------

function CineHero() {
  const ref = useRef<HTMLElement>(null)
  const p = useProgress(ref)

  return (
    <section ref={ref} style={{ position: 'relative', minHeight: '100vh', paddingTop: 100 }}>
      <HeroBackdrop p={p} />
      <div
        style={{
          maxWidth: 1360,
          margin: '0 auto',
          padding: '60px 36px 48px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <h1
          className="serif"
          style={{
            fontSize: 'clamp(72px, 10vw, 168px)',
            lineHeight: 0.9,
            letterSpacing: '-0.045em',
            margin: 0,
            fontWeight: 400,
            maxWidth: '1100px',
          }}
        >
          <RevealLine delay={0}>Your inbox is a</RevealLine>
          <RevealLine delay={140}>
            to-do list <em style={{ fontStyle: 'italic', color: 'var(--ef-signal)' }}>in disguise</em>.
          </RevealLine>
        </h1>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 60,
            alignItems: 'end',
            marginTop: 60,
          }}
        >
          <p
            className="sans"
            style={{ fontSize: 19, lineHeight: 1.55, color: 'var(--ef-ink-dim)', margin: 0, maxWidth: 520 }}
          >
            Long threads. Buried asks. Deadlines you notice only once they&apos;re late. EmailFlow AI reads every
            thread, pulls out the real tasks, and ranks what needs you first.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Link
                href="/demo"
                className="sans"
                style={{
                  fontSize: 14,
                  padding: '14px 22px',
                  background: 'var(--ef-surface)',
                  color: 'var(--ef-ink)',
                  border: '1px solid var(--ef-line)',
                  borderRadius: 999,
                  fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                See the live demo →
              </Link>
              <Link
                href="/auth/signup"
                className="sans"
                style={{
                  fontSize: 14,
                  padding: '14px 22px',
                  background: 'var(--ef-signal)',
                  color: '#fff',
                  borderRadius: 999,
                  fontWeight: 500,
                  boxShadow: '0 2px 6px rgba(30,75,224,0.25), 0 16px 40px rgba(30,75,224,0.18)',
                  textDecoration: 'none',
                }}
              >
                Connect Gmail →
              </Link>
            </div>
            <span className="sans" style={{ fontSize: 12.5, color: 'var(--ef-ink-mute)' }}>
              Free to start · read-only — never sends, deletes, or changes your mail.
            </span>
          </div>
        </div>

        <div style={{ marginTop: 40 }}>
          <HeroPipeline />
        </div>

        <div
          style={{
            marginTop: 48,
            display: 'flex',
            justifyContent: 'center',
            opacity: clamp((0.25 - p) * 4),
          }}
        >
          <ScrollHint />
        </div>
      </div>
    </section>
  )
}

function HeroBackdrop({ p }: { p: number }) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          backgroundImage:
            'linear-gradient(var(--ef-line-soft) 1px, transparent 1px), linear-gradient(90deg, var(--ef-line-soft) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse at 50% 0%, #000 30%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 0%, #000 30%, transparent 70%)',
          opacity: 0.55,
          transform: `translateY(${p * -40}px)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '30%',
          right: '-10%',
          width: 720,
          height: 720,
          background: 'radial-gradient(circle, rgba(30,75,224,0.12) 0%, transparent 60%)',
          transform: `translate(${p * -100}px, ${p * -80}px)`,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
    </>
  )
}

function RevealLine({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 100 + delay)
    return () => clearTimeout(t)
  }, [delay])
  return (
    <span style={{ overflow: 'hidden', display: 'block' }}>
      <span
        style={{
          display: 'block',
          transform: on ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform 1.1s cubic-bezier(.2,.8,.2,1)',
          opacity: on ? 1 : 0,
        }}
      >
        {children}
      </span>
    </span>
  )
}

function Label({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      className="mono"
      style={{
        fontSize: 12,
        color: 'var(--ef-signal)',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        fontWeight: 600,
        ...style,
      }}
    >
      {children}
    </span>
  )
}

function ScrollHint() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--ef-ink-mute)', letterSpacing: '0.2em' }}>
        SCROLL
      </span>
      <div
        style={{
          width: 1,
          height: 48,
          background: 'linear-gradient(var(--ef-signal), transparent)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 16,
            background: 'var(--ef-signal)',
            animation: 'landingScrollHint 2s ease-in-out infinite',
          }}
        />
      </div>
    </div>
  )
}

// ---------- Hero pipeline ----------

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

function HeroPipeline() {
  const [step, setStep] = useState(0)
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
        padding: 28,
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

      <div style={{ position: 'relative', minHeight: 172 }}>
        {PIPELINE_PAIRS.map((pair, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              gridTemplateColumns: '1fr 96px 1fr',
              alignItems: 'center',
              gap: 8,
              opacity: step === i ? 1 : 0,
              transform: step === i ? 'translateY(0)' : 'translateY(10px)',
              transition: 'opacity 600ms cubic-bezier(.2,.8,.2,1), transform 600ms cubic-bezier(.2,.8,.2,1)',
              pointerEvents: step === i ? 'auto' : 'none',
            }}
          >
            <PipelineEmailCard pair={pair} />
            <PipelineConnector />
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

function PipelineConnector() {
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
      <svg width="40" height="12" viewBox="0 0 40 12" fill="none">
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

// ---------- Pinned story (4 acts) ----------

function CinePinnedStory() {
  // Section is 500vh tall in the document flow. The inner div uses
  // `position: sticky; top: 0` so it pins to the viewport while we scroll
  // through the remaining 400vh — that 400vh window drives the act/subP
  // progression. No nested scroll container, so the page's natural scroll
  // (and trackpad/wheel momentum) is never interrupted.
  const sectionRef = useRef<HTMLElement>(null)
  const [act, setAct] = useState(0)
  const [subP, setSubP] = useState(0)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const el = sectionRef.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const vh = window.innerHeight
        const pinnedRange = r.height - vh // section height (500vh) - sticky height (100vh) = 400vh
        if (pinnedRange <= 0) return
        const progress = Math.max(0, Math.min(1, -r.top / pinnedRange))
        const raw = progress * 4
        const nextAct = Math.min(3, Math.floor(raw))
        // Subtract the clamped act (not floor(raw)) so when progress=1
        // subP correctly resolves to 1 instead of jumping back to 0.
        setAct(nextAct)
        setSubP(clamp(raw - nextAct))
      })
    }
    window.addEventListener('scroll', tick, { passive: true })
    window.addEventListener('resize', tick)
    tick()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', tick)
      window.removeEventListener('resize', tick)
    }
  }, [])

  const titles = ['Read.', 'Understand.', 'List.', 'Rank.']
  const descs = [
    'EmailFlow connects to your Gmail and reads it — that is all it can do. New email gets picked up automatically.',
    'It reads each email the way you would: who is asking, what they need, and by when. The real requests get separated from the noise.',
    'Every real request becomes a task — with its deadline, who it is for, and the original email attached so you never lose the context.',
    'Each task is ranked by how urgent it is, so you get one clear list. Start at the top and work your way down.',
  ]

  return (
    <section ref={sectionRef} style={{ position: 'relative', height: '500vh' }}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          width: '100%',
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: '1fr 1.4fr',
          alignItems: 'center',
          background: 'var(--ef-base)',
        }}
      >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                backgroundImage:
                  'linear-gradient(var(--ef-line-soft) 1px, transparent 1px), linear-gradient(90deg, var(--ef-line-soft) 1px, transparent 1px)',
                backgroundSize: '48px 48px',
                opacity: 0.4,
              }}
            />

            <div style={{ padding: '0 60px 0 clamp(24px, 4vw, 80px)', position: 'relative', zIndex: 1 }}>
              <Label>HOW IT WORKS</Label>

              <div style={{ position: 'relative', height: 90, overflow: 'hidden', marginTop: 20 }}>
                {titles.map((t, i) => (
                  <div
                    key={t}
                    className="serif"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      fontSize: 'clamp(48px, 5.5vw, 80px)',
                      lineHeight: 1,
                      letterSpacing: '-0.03em',
                      fontWeight: 400,
                      opacity: act === i ? 1 : 0,
                      transform:
                        act === i ? 'translateY(0)' : act > i ? 'translateY(-24px)' : 'translateY(24px)',
                      transition:
                        'opacity 500ms cubic-bezier(.2,.8,.2,1), transform 500ms cubic-bezier(.2,.8,.2,1)',
                    }}
                  >
                    {t}
                  </div>
                ))}
              </div>

              <div style={{ position: 'relative', height: 130, overflow: 'hidden', marginTop: 24 }}>
                {descs.map((d, i) => (
                  <p
                    key={i}
                    className="sans"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      fontSize: 17,
                      lineHeight: 1.65,
                      color: 'var(--ef-ink-dim)',
                      margin: 0,
                      opacity: act === i ? 1 : 0,
                      transform:
                        act === i ? 'translateY(0)' : act > i ? 'translateY(-10px)' : 'translateY(10px)',
                      transition:
                        'opacity 500ms cubic-bezier(.2,.8,.2,1), transform 500ms cubic-bezier(.2,.8,.2,1)',
                    }}
                  >
                    {d}
                  </p>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 44 }}>
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    style={{
                      height: 2,
                      flex: 1,
                      background: 'var(--ef-line)',
                      borderRadius: 2,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        background: 'var(--ef-signal)',
                        transform: `scaleX(${i < act ? 1 : i === act ? subP : 0})`,
                        transformOrigin: 'left',
                        transition: 'transform 80ms linear',
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--ef-ink-mute)', marginTop: 14, letterSpacing: '0.14em' }}>
                Step {act + 1} of 4 · scroll to continue
              </div>
            </div>

            <div
              style={{
                padding: '40px clamp(24px, 4vw, 80px) 40px 0',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                position: 'relative',
                zIndex: 1,
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: 'min(520px, 70vh)',
                  border: '1px solid var(--ef-line)',
                  borderRadius: 20,
                  background: 'var(--ef-surface)',
                  overflow: 'hidden',
                  boxShadow: '0 40px 100px rgba(10,16,36,0.08)',
                  position: 'relative',
                }}
              >
                {[
                  <Act1Read key={0} subP={act === 0 ? subP : 0} />,
                  <Act2Understand key={1} subP={act === 1 ? subP : 0} />,
                  <Act3Extract key={2} subP={act === 2 ? subP : 0} />,
                  <Act4Rank key={3} subP={act === 3 ? subP : 0} />,
                ].map((child, i) => (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      padding: 28,
                      opacity: act === i ? 1 : 0,
                      transform:
                        act === i ? 'scale(1)' : act > i ? 'scale(0.97)' : 'scale(1.02)',
                      transition:
                        'opacity 500ms cubic-bezier(.2,.8,.2,1), transform 500ms cubic-bezier(.2,.8,.2,1)',
                      pointerEvents: act === i ? 'auto' : 'none',
                    }}
                  >
                    {child}
                  </div>
                ))}
              </div>
            </div>
          </div>
    </section>
  )
}

function Act1Read({ subP }: { subP: number }) {
  const emails = [
    { initial: 'M', name: 'Morgan Lee', subj: 'Re: Q2 launch sign-off', time: '8:42a', color: '#1E4BE0' },
    { initial: 'P', name: 'Priya Sharma', subj: 'Vendor contract — redlines v3', time: '8:15a', color: '#7A4DE0' },
    { initial: 'L', name: 'Lena Cole', subj: 'Homepage redesign — round 2', time: 'Yest', color: '#E0884D' },
    { initial: 'D', name: 'Daniel Cho', subj: 'Go / no-go meeting Thursday', time: 'Yest', color: '#1F7A4D' },
    { initial: 'T', name: 'Talent Team', subj: 'Interview feedback needed', time: 'Mon', color: '#C4302B' },
  ]
  const scan = clamp(subP * 1.2)
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span className="sans" style={{ fontSize: 15, fontWeight: 600 }}>
          Gmail · Inbox
        </span>
        <span
          className="mono"
          style={{ fontSize: 11, color: 'var(--ef-signal)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: 'var(--ef-signal)',
              animation: 'landingPulseDot 1.4s infinite',
            }}
          />
          Reading
        </span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {emails.map((e, i) => {
          const read = scan > (i + 0.6) / emails.length
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 14px',
                border: '1px solid',
                borderColor: read ? 'var(--ef-signal)' : 'var(--ef-line)',
                borderRadius: 10,
                background: read
                  ? 'color-mix(in oklab, var(--ef-signal) 6%, var(--ef-surface))'
                  : 'var(--ef-surface)',
                transition: 'background 350ms ease, border-color 350ms ease',
              }}
            >
              <div
                className="sans"
                style={{
                  width: 30,
                  height: 30,
                  flexShrink: 0,
                  borderRadius: 999,
                  background: e.color,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {e.initial}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="sans" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ef-ink)' }}>
                  {e.name}
                </div>
                <div
                  className="sans"
                  style={{
                    fontSize: 12.5,
                    color: 'var(--ef-ink-mute)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {e.subj}
                </div>
              </div>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--ef-ink-faint)', flexShrink: 0 }}>
                {e.time}
              </span>
              <span
                style={{
                  width: 18,
                  height: 18,
                  flexShrink: 0,
                  borderRadius: 999,
                  background: 'var(--ef-signal)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  opacity: read ? 1 : 0,
                  transform: read ? 'scale(1)' : 'scale(0.5)',
                  transition: 'all 300ms cubic-bezier(.2,.8,.2,1)',
                }}
              >
                ✓
              </span>
            </div>
          )
        })}
      </div>
      <div
        className="sans"
        style={{ marginTop: 16, fontSize: 12, color: 'var(--ef-ink-mute)', textAlign: 'center', lineHeight: 1.5 }}
      >
        EmailFlow only <strong style={{ color: 'var(--ef-ink-dim)' }}>reads</strong> your inbox — it never sends,
        deletes, or changes anything.
      </div>
    </div>
  )
}

function Act2Understand({ subP }: { subP: number }) {
  const findings: Array<[string, string]> = [
    ['They want', 'Your approval on the launch assets'],
    ['By when', 'End of day today'],
    ['Urgency', 'High — it blocks the launch'],
    ['Project', 'Q2 Launch'],
  ]
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          border: '1px solid var(--ef-line)',
          borderRadius: 12,
          padding: 16,
          background: 'var(--ef-surface-2)',
        }}
      >
        <div className="mono" style={{ fontSize: 11, color: 'var(--ef-ink-mute)', marginBottom: 6 }}>
          Morgan Lee · 8:42am
        </div>
        <div className="serif" style={{ fontSize: 19, fontWeight: 400, marginBottom: 8 }}>
          Re: Q2 launch sign-off
        </div>
        <div className="sans" style={{ fontSize: 13, color: 'var(--ef-ink-dim)', lineHeight: 1.55 }}>
          &ldquo;Need your approval on the launch assets by end of day today — design cleared everything on the
          16th.&rdquo;
        </div>
      </div>
      <div
        style={{
          flex: 1,
          border: '1px solid var(--ef-signal)',
          borderRadius: 12,
          padding: '16px 18px',
          background: 'color-mix(in oklab, var(--ef-signal) 4%, var(--ef-surface))',
        }}
      >
        <div className="sans" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ef-signal)', marginBottom: 14 }}>
          What EmailFlow understood
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {findings.map(([k, v], i) => {
            const visible = subP > 0.12 + i * 0.18
            return (
              <div
                key={k}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'translateY(0)' : 'translateY(8px)',
                  transition: 'all 420ms cubic-bezier(.2,.8,.2,1)',
                }}
              >
                <span
                  className="mono"
                  style={{
                    fontSize: 10.5,
                    color: 'var(--ef-ink-mute)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    width: 78,
                    flexShrink: 0,
                  }}
                >
                  {k}
                </span>
                <span style={{ color: 'var(--ef-signal)', flexShrink: 0 }}>→</span>
                <span className="sans" style={{ fontSize: 14, color: 'var(--ef-ink)', fontWeight: 500 }}>
                  {v}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Act3Extract({ subP }: { subP: number }) {
  const showTask = subP > 0.32
  const markStyle: CSSProperties = {
    background: 'color-mix(in oklab, var(--ef-signal) 20%, transparent)',
    color: 'var(--ef-ink)',
    padding: '2px 4px',
    borderRadius: 3,
  }
  const chipStyle: CSSProperties = {
    fontSize: 11,
    padding: '4px 10px',
    borderRadius: 999,
    border: '1px solid var(--ef-line)',
    background: 'var(--ef-surface)',
    color: 'var(--ef-ink-dim)',
  }
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 18,
      }}
    >
      <div>
        <div
          className="sans"
          style={{
            fontSize: 11,
            color: 'var(--ef-ink-mute)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: 600,
            marginBottom: 10,
          }}
        >
          From the email
        </div>
        <div className="sans" style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--ef-ink-dim)' }}>
          &ldquo;Need your <mark style={markStyle}>approval on the launch assets</mark> by{' '}
          <mark style={markStyle}>end of day today</mark>.&rdquo;
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--ef-line)' }} />
        <span
          className="mono"
          style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ef-signal)', letterSpacing: '0.1em' }}
        >
          BECOMES A TASK ↓
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--ef-line)' }} />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
          padding: 18,
          borderRadius: 12,
          border: '1px solid var(--ef-signal)',
          background: 'color-mix(in oklab, var(--ef-signal) 4%, var(--ef-surface))',
          opacity: showTask ? 1 : 0,
          transform: showTask ? 'translateY(0)' : 'translateY(14px)',
          transition: 'all 550ms cubic-bezier(.2,.8,.2,1)',
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            flexShrink: 0,
            marginTop: 2,
            borderRadius: 6,
            border: '2px solid var(--ef-signal)',
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="serif" style={{ fontSize: 21, letterSpacing: '-0.01em', lineHeight: 1.25 }}>
            Approve the launch assets
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <span className="sans" style={chipStyle}>
              Due today, 6:00pm
            </span>
            <span className="sans" style={chipStyle}>
              Q2 Launch
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Act4Rank({ subP }: { subP: number }) {
  const tasks: Array<[string, 'High' | 'Med' | 'Low']> = [
    ['Approve the launch assets', 'High'],
    ['Review the contract changes', 'High'],
    ['Confirm the Thursday meeting', 'Med'],
    ['Send the quarterly numbers', 'Med'],
    ['Approve the vendor renewal', 'Low'],
  ]
  const levelStyle: Record<'High' | 'Med' | 'Low', { bg: string; fg: string }> = {
    High: { bg: '#FDECEA', fg: '#C23030' },
    Med: { bg: '#FEF3E0', fg: '#A07420' },
    Low: { bg: 'var(--ef-surface-2)', fg: 'var(--ef-ink-mute)' },
  }
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="sans" style={{ fontSize: 15, fontWeight: 600 }}>
        Your day, in order
      </div>
      <div className="sans" style={{ fontSize: 12, color: 'var(--ef-ink-mute)', marginTop: 2, marginBottom: 16 }}>
        One list — most important first.
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {tasks.map(([title, level], i) => {
          const visible = subP > i * 0.16
          const lc = levelStyle[level]
          return (
            <div
              key={title}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 13,
                padding: '12px 14px',
                border: '1px solid var(--ef-line)',
                borderRadius: 10,
                background: 'var(--ef-surface)',
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateX(0)' : 'translateX(-18px)',
                transition: 'all 450ms cubic-bezier(.2,.8,.2,1)',
              }}
            >
              <span
                className="serif"
                style={{ fontSize: 20, color: 'var(--ef-signal)', width: 22, textAlign: 'center', flexShrink: 0 }}
              >
                {i + 1}
              </span>
              <span className="sans" style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--ef-ink)' }}>
                {title}
              </span>
              <span
                className="sans"
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: lc.bg,
                  color: lc.fg,
                  flexShrink: 0,
                }}
              >
                {level}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------- Metrics ----------

function CineMetrics() {
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

// ---------- Matrix ----------

function CineMatrix() {
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

// ---------- CTA ----------

function CineCTA() {
  return (
    <section style={{ padding: '100px 36px', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(30,75,224,0.12) 0%, transparent 60%)',
        }}
      />
      <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center', position: 'relative' }}>
        <Label>GET STARTED</Label>
        <h2
          className="serif"
          style={{
            fontSize: 'clamp(56px, 8vw, 128px)',
            lineHeight: 0.92,
            letterSpacing: '-0.04em',
            margin: '24px 0 36px',
            fontWeight: 400,
          }}
        >
          Two minutes to connect.
          <br />
          <em style={{ fontStyle: 'italic', color: 'var(--ef-signal)' }}>Then your inbox works for you.</em>
        </h2>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
          <Link
            href="/auth/signup"
            className="sans"
            style={{
              fontSize: 15,
              padding: '16px 28px',
              background: 'var(--ef-signal)',
              color: '#fff',
              borderRadius: 999,
              fontWeight: 500,
              boxShadow: '0 2px 8px rgba(30,75,224,0.25), 0 20px 50px rgba(30,75,224,0.2)',
              textDecoration: 'none',
            }}
          >
            Connect Gmail →
          </Link>
          <Link
            href="/demo"
            className="sans"
            style={{
              fontSize: 15,
              padding: '16px 28px',
              color: 'var(--ef-ink)',
              border: '1px solid var(--ef-line)',
              borderRadius: 999,
              textDecoration: 'none',
            }}
          >
            See the live demo →
          </Link>
        </div>
      </div>
    </section>
  )
}

// ---------- Footer ----------

function CineFooter() {
  return (
    <footer style={{ borderTop: '1px solid var(--ef-line-soft)', padding: '56px 36px 32px' }}>
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 32 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <LogoMark />
              <span className="sans" style={{ fontSize: 16, fontWeight: 600 }}>
                EmailFlow AI
              </span>
            </div>
            <p
              className="serif"
              style={{
                fontSize: 18,
                lineHeight: 1.4,
                color: 'var(--ef-ink-dim)',
                marginTop: 16,
                maxWidth: 320,
                fontStyle: 'italic',
              }}
            >
              Your inbox is a to-do list in disguise.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
            <Link
              href="/auth/signin"
              className="sans"
              style={{ fontSize: 13.5, color: 'var(--ef-ink-dim)', textDecoration: 'none' }}
            >
              Sign in
            </Link>
            <Link
              href="/auth/signup"
              className="sans"
              style={{ fontSize: 13.5, color: 'var(--ef-ink-dim)', textDecoration: 'none' }}
            >
              Start free
            </Link>
          </div>
        </div>
        <div style={{ height: 1, background: 'var(--ef-line-soft)', margin: '40px 0 20px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--ef-ink-mute)' }}>
            © {new Date().getFullYear()} EmailFlow AI
          </span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--ef-signal)' }}>
            ● Read-only · disconnect any time
          </span>
        </div>
      </div>
    </footer>
  )
}
