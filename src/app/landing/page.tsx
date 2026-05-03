'use client'

import Image from 'next/image'
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

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

// ---------- Top-level page ----------

export default function LandingPage() {
  return (
    <div className="landing-cine" style={{ overflow: 'hidden' }}>
      <CineNav />
      <CineHero />
      <CinePinnedStory />
      <CineMetrics />
      <CineMatrix />
      <CineDashboard />
      <CineWho />
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
            Start free
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
        background: '#2563eb',
        boxShadow: '0 1px 2px rgba(37,99,235,0.25), 0 6px 16px rgba(37,99,235,0.18)',
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
        <div style={{ marginBottom: 40 }}>
          <Label>{'// EmailFlow · 2026'}</Label>
        </div>
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
          <RevealLine delay={0}>The inbox</RevealLine>
          <RevealLine delay={140}>
            that clears <em style={{ fontStyle: 'italic', color: 'var(--ef-signal)' }}>itself</em>.
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
            EmailFlow AI reads every thread, extracts the real work, and hands you a ranked queue. For people whose
            inbox <em>is</em> the job — and who&apos;d rather be done with it by 10am.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'end' }}>
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
        fontSize: 11.5,
        color: 'var(--ef-ink-mute)',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        fontWeight: 500,
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

type PipelineItem = { from: string; subj: string; task: string; proj: string; p: string; due: string }

function HeroPipeline() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % 4), 2200)
    return () => clearInterval(id)
  }, [])
  const items: PipelineItem[] = [
    { from: 'morgan@northwind.co', subj: 'Re: Q2 launch sign-off', task: 'Reply approval on assets', proj: 'Q2 Launch', p: 'P0', due: 'Today' },
    { from: 'priya@acme.io', subj: 'Vendor contract — redlines v3', task: 'Review §4.2, send back', proj: 'Acme Renewal', p: 'P0', due: 'Today' },
    { from: 'lena@studio.co', subj: 'Stakeholder briefing', task: 'Confirm Thu 10am slot', proj: 'Atlas', p: 'P1', due: 'Tomorrow' },
  ]
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <Label>LIVE PIPELINE</Label>
          <div className="serif" style={{ fontSize: 28, letterSpacing: '-0.02em', marginTop: 8 }}>
            Inbox → Queue, in real time
          </div>
        </div>
        <div className="mono" style={{ fontSize: 12, color: 'var(--ef-signal)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: 'var(--ef-signal)',
              animation: 'landingPulseDot 1.4s infinite',
            }}
          />
          processing
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', alignItems: 'center', gap: 24 }}>
        <div>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--ef-ink-mute)', marginBottom: 10, letterSpacing: '0.14em' }}>
            RAW · GMAIL
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((it, i) => (
              <RawCard key={i} item={it} active={i === step % items.length} />
            ))}
          </div>
        </div>

        <FlowArrow step={step} />

        <div>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--ef-signal)', marginBottom: 10, letterSpacing: '0.14em' }}>
            QUEUE · TASKS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((it, i) => (
              <TaskCard key={i} item={it} active={i === step % items.length} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function RawCard({ item, active }: { item: PipelineItem; active: boolean }) {
  return (
    <div
      style={{
        padding: '12px 14px',
        border: '1px solid var(--ef-line)',
        borderRadius: 10,
        background: 'var(--ef-surface)',
        transition: 'all 500ms cubic-bezier(.2,.8,.2,1)',
        transform: active ? 'translateX(6px)' : 'translateX(0)',
        borderColor: active ? 'var(--ef-signal)' : 'var(--ef-line)',
        boxShadow: active ? '0 8px 24px rgba(30,75,224,0.15)' : 'none',
      }}
    >
      <div className="mono" style={{ fontSize: 10.5, color: 'var(--ef-ink-mute)' }}>
        {item.from}
      </div>
      <div className="sans" style={{ fontSize: 13.5, color: 'var(--ef-ink)', marginTop: 3 }}>
        {item.subj}
      </div>
    </div>
  )
}

function TaskCard({ item, active }: { item: PipelineItem; active: boolean }) {
  return (
    <div
      style={{
        padding: '12px 14px',
        border: '1px solid var(--ef-line)',
        borderRadius: 10,
        background: active ? 'color-mix(in oklab, var(--ef-signal) 8%, var(--ef-surface))' : 'var(--ef-surface)',
        transition: 'all 700ms cubic-bezier(.2,.8,.2,1)',
        opacity: active ? 1 : 0.45,
        transform: active ? 'translateX(0)' : 'translateX(-6px)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--ef-signal)', fontWeight: 600 }}>
          {item.p} · {item.proj}
        </span>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--ef-ink-mute)' }}>
          {item.due}
        </span>
      </div>
      <div className="sans" style={{ fontSize: 13.5, color: 'var(--ef-ink)', marginTop: 4 }}>
        ↳ {item.task}
      </div>
    </div>
  )
}

function FlowArrow({ step }: { step: number }) {
  const fraction = ((step + 1) % 4) / 4
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '20px 0' }}>
      <div className="mono" style={{ fontSize: 10, color: 'var(--ef-ink-mute)', letterSpacing: '0.14em' }}>
        PARSE
      </div>
      <svg width="60" height="60" viewBox="0 0 60 60">
        <circle cx="30" cy="30" r="22" stroke="var(--ef-line)" strokeWidth="1.5" fill="none" />
        <circle
          cx="30"
          cy="30"
          r="22"
          stroke="var(--ef-signal)"
          strokeWidth="1.5"
          fill="none"
          strokeDasharray="138"
          strokeDashoffset={138 - 138 * fraction}
          style={{ transition: 'stroke-dashoffset 2.2s linear', transform: 'rotate(-90deg)', transformOrigin: 'center' }}
        />
        <text
          x="30"
          y="34"
          textAnchor="middle"
          style={{ fontSize: 11, fill: 'var(--ef-signal)', fontFamily: 'var(--ff-mono)' }}
        >
          {Math.round(fraction * 100)}
        </text>
      </svg>
      <div className="mono" style={{ fontSize: 10, color: 'var(--ef-ink-mute)', letterSpacing: '0.14em' }}>
        → EXTRACT
      </div>
    </div>
  )
}

// ---------- Pinned story (4 acts) ----------

function CinePinnedStory() {
  const [act, setAct] = useState(0)
  const [subP, setSubP] = useState(0)

  const onInternalScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const scrollable = el.scrollHeight - el.clientHeight
    if (scrollable <= 0) return
    const progress = el.scrollTop / scrollable
    const raw = progress * 4
    setAct(Math.min(3, Math.floor(raw)))
    setSubP(clamp(raw - Math.floor(raw)))
  }

  const titles = ['Read.', 'Understand.', 'Extract.', 'Rank.']
  const descs = [
    'We attach to Gmail read-only. Every new thread flows into the pipeline within 800ms. We never send, delete, or modify mail.',
    'The model reads each thread in context: who is asking, for what, by when. It separates signal from noise — action from polite acknowledgement.',
    'Real asks become structured tasks with deadline, owner, and parent matter. The email stays attached as context so you never lose the thread.',
    'A single priority score 0–100 — deadline proximity, sender weight, thread age. One ordered list. Work top-down and close it out.',
  ]

  return (
    <section style={{ position: 'relative' }}>
      <div
        onScroll={onInternalScroll}
        style={{
          height: '100vh',
          overflowY: 'scroll',
          position: 'relative',
        }}
      >
        <div style={{ height: '500vh', position: 'relative' }}>
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
              <Label>{'// WORKFLOW'}</Label>

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
                STAGE 0{act + 1} / 04 · SCROLL TO ADVANCE
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
        </div>
      </div>
    </section>
  )
}

function Act1Read({ subP }: { subP: number }) {
  const envs = [0, 1, 2, 3, 4, 5, 6]
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 14, left: 14 }}>
        <Label>{'// GMAIL → PIPELINE'}</Label>
      </div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {envs.map((i) => {
          const t = (subP * 4 + i * 0.22) % 1
          const y = lerp(-100, 260, t)
          const opacity = t < 0.1 ? t * 10 : t > 0.85 ? (1 - t) * 6.67 : 1
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${20 + i * 11}%`,
                top: y,
                width: 68,
                height: 44,
                borderRadius: 6,
                border: '1.5px solid var(--ef-ink)',
                background: 'var(--ef-surface)',
                opacity,
                transition: 'none',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '50%',
                  borderBottom: '1.5px solid var(--ef-ink)',
                  clipPath: 'polygon(0 0, 50% 100%, 100% 0)',
                  background: 'var(--ef-surface-2)',
                }}
              />
            </div>
          )
        })}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 60,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '60%',
          height: 4,
          background: 'var(--ef-signal)',
          borderRadius: 2,
          boxShadow: '0 0 32px rgba(30,75,224,0.6)',
        }}
      />
      <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center' }}>
        <span className="mono" style={{ fontSize: 12, color: 'var(--ef-signal)' }}>
          READ-ONLY · OAUTH 2.0
        </span>
      </div>
    </div>
  )
}

function Act2Understand({ subP }: { subP: number }) {
  const chips = [
    { t: 'action', x: 58, y: 18, d: 0.1 },
    { t: 'urgent', x: 70, y: 38, d: 0.3 },
    { t: 'project: Q2 Launch', x: 28, y: 58, d: 0.5 },
    { t: 'sender: known', x: 62, y: 76, d: 0.7 },
  ]
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 14, left: 14 }}>
        <Label>{'// MODEL · CLAUDE'}</Label>
      </div>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '64%',
          padding: 20,
          background: 'var(--ef-surface-2)',
          border: '1px solid var(--ef-line)',
          borderRadius: 12,
        }}
      >
        <div className="mono" style={{ fontSize: 11, color: 'var(--ef-ink-mute)', marginBottom: 6 }}>
          morgan@northwind.co · 8:42am
        </div>
        <div className="serif" style={{ fontSize: 20, fontWeight: 400, marginBottom: 10 }}>
          Re: Q2 launch sign-off
        </div>
        <div className="sans" style={{ fontSize: 13, color: 'var(--ef-ink-dim)', lineHeight: 1.55 }}>
          &ldquo;Need your approval on final asset delivery by EOD today — design cleared everything on the 16th. We can
          push to next week if you&apos;re underwater.&rdquo;
        </div>
      </div>
      {chips.map((c, i) => {
        const visible = subP > c.d
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${c.x}%`,
              top: `${c.y}%`,
              padding: '5px 10px',
              borderRadius: 999,
              border: '1px solid var(--ef-signal)',
              background: 'var(--ef-surface)',
              transform: visible ? 'scale(1)' : 'scale(0.6)',
              opacity: visible ? 1 : 0,
              transition: 'all 400ms cubic-bezier(.2,.8,.2,1)',
            }}
          >
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--ef-signal)', fontWeight: 600 }}>
              ● {c.t}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Act3Extract({ subP }: { subP: number }) {
  const showTask = subP > 0.35
  const showFields = subP > 0.55
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 20,
        alignItems: 'center',
      }}
    >
      <div style={{ position: 'absolute', top: 14, left: 14 }}>
        <Label>{'// EXTRACT'}</Label>
      </div>
      <div style={{ paddingLeft: 8 }}>
        <div className="sans" style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--ef-ink-dim)' }}>
          &ldquo;Need your{' '}
          <mark
            style={{
              background: 'color-mix(in oklab, var(--ef-signal) 22%, transparent)',
              color: 'var(--ef-ink)',
              padding: '2px 4px',
              borderRadius: 3,
            }}
          >
            approval on final asset delivery
          </mark>{' '}
          by{' '}
          <mark
            style={{
              background: 'color-mix(in oklab, var(--ef-signal) 22%, transparent)',
              color: 'var(--ef-ink)',
              padding: '2px 4px',
              borderRadius: 3,
            }}
          >
            EOD today
          </mark>{' '}
          — design cleared everything on the 16th.&rdquo;
        </div>
      </div>
      <div
        style={{
          padding: 18,
          borderRadius: 12,
          border: '1px solid var(--ef-signal)',
          background: 'color-mix(in oklab, var(--ef-signal) 4%, var(--ef-surface))',
          transform: showTask ? 'translateX(0)' : 'translateX(20px)',
          opacity: showTask ? 1 : 0,
          transition: 'all 600ms cubic-bezier(.2,.8,.2,1)',
        }}
      >
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--ef-signal)', fontWeight: 600, marginBottom: 8 }}>
          P0 · Q2 LAUNCH
        </div>
        <div className="serif" style={{ fontSize: 22, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
          Reply approval on asset delivery
        </div>
        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: '1px solid var(--ef-line)',
            display: showFields ? 'grid' : 'none',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px 16px',
          }}
        >
          {[
            ['due', 'Today 6:00pm'],
            ['thread', '1 of 4'],
            ['sender', 'morgan@northwind.co'],
            ['project', 'Q2 Launch'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--ef-ink-mute)' }}>
                {k}
              </span>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--ef-ink)' }}>
                {v}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Act4Rank({ subP }: { subP: number }) {
  const tasks = [
    { t: 'Reply approval on asset delivery', v: 96, p: 'P0' },
    { t: 'Review §4.2, send redlines back', v: 91, p: 'P0' },
    { t: 'Confirm Thu 10am stakeholder slot', v: 74, p: 'P1' },
    { t: 'Send cap table + ARR chart', v: 68, p: 'P1' },
    { t: 'Approve vendor SOC-2 renewal', v: 42, p: 'P2' },
  ]
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: '4px 0',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <div style={{ position: 'absolute', top: 14, left: 14 }}>
        <Label>{'// PRIORITY SCORE 0–100'}</Label>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        {tasks.map((t, i) => {
          const w = clamp(subP * 1.4 - i * 0.1, 0, 1) * t.v
          const bg =
            t.p === 'P0'
              ? 'color-mix(in oklab, #E03E3E 12%, transparent)'
              : t.p === 'P1'
              ? 'color-mix(in oklab, #F5B547 12%, transparent)'
              : 'var(--ef-surface-2)'
          const color = t.p === 'P0' ? '#C23030' : t.p === 'P1' ? '#A07420' : 'var(--ef-ink-mute)'
          return (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '44px 1fr 56px',
                gap: 12,
                alignItems: 'center',
              }}
            >
              <span
                className="mono"
                style={{
                  fontSize: 10.5,
                  padding: '3px 7px',
                  borderRadius: 3,
                  textAlign: 'center',
                  background: bg,
                  color,
                  fontWeight: 600,
                }}
              >
                {t.p}
              </span>
              <div style={{ position: 'relative', height: 28 }}>
                <div
                  className="sans"
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: 6,
                    fontSize: 12.5,
                    color: 'var(--ef-ink)',
                    zIndex: 2,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.t}
                </div>
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    height: '100%',
                    width: `${w}%`,
                    background: 'color-mix(in oklab, var(--ef-signal) 18%, var(--ef-surface-2))',
                    borderRadius: 4,
                    transition: 'width 120ms linear',
                    borderRight: '2px solid var(--ef-signal)',
                  }}
                />
              </div>
              <span
                className="mono"
                style={{ fontSize: 12, color: 'var(--ef-signal)', textAlign: 'right', fontWeight: 600 }}
              >
                {Math.round(w)}
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
  const on = p > 0.15
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
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: 72 }}>
          <div>
            <Label>{'// MEASURED'}</Label>
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
              Efficiency, in numbers.
            </h2>
          </div>
          <span className="mono" style={{ fontSize: 12, color: 'var(--ef-ink-mute)', letterSpacing: '0.14em' }}>
            PRIVATE BETA · Q1 2026
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1px solid var(--ef-line)' }}>
          <MetricCell target={87} unit="%" label="inbox → action ratio" desc="Threads closed without re-opening" on={on} />
          <MetricCell target={2.1} unit="s" label="avg processing time" desc="From delivery to task in queue" fix={1} on={on} />
          <MetricCell
            target={11400}
            unit=""
            label="tasks auto-extracted"
            desc="Across beta cohort, Q1"
            fmt={(n) => Math.round(n).toLocaleString()}
            on={on}
          />
          <MetricCell target={94} unit="%" label="digest accuracy" desc="Rated useful by users (n=412)" on={on} />
        </div>
      </div>
    </section>
  )
}

function MetricCell({
  target,
  unit,
  label,
  desc,
  fix = 0,
  fmt,
  on,
}: {
  target: number
  unit: string
  label: string
  desc: string
  fix?: number
  fmt?: (n: number) => string
  on: boolean
}) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!on) return
    const dur = 1600
    let start: number | null = null
    let raf: number
    const step = (t: number) => {
      if (start === null) start = t
      const p = Math.min(1, (t - start) / dur)
      const eased = 1 - Math.pow(1 - p, 4)
      setN(target * eased)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [on, target])
  const shown = fmt ? fmt(n) : fix ? n.toFixed(fix) : Math.round(n).toString()
  return (
    <div style={{ padding: '40px 36px 48px', borderRight: '1px solid var(--ef-line)' }}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--ef-ink-mute)', letterSpacing: '0.14em', marginBottom: 28 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span
          className="serif"
          style={{ fontSize: 88, lineHeight: 0.95, letterSpacing: '-0.035em', color: 'var(--ef-signal)' }}
        >
          {shown}
        </span>
        {unit && (
          <span className="serif" style={{ fontSize: 40, color: 'var(--ef-signal)' }}>
            {unit}
          </span>
        )}
      </div>
      <div className="sans" style={{ fontSize: 13.5, color: 'var(--ef-ink-dim)', marginTop: 20, lineHeight: 1.5 }}>
        {desc}
      </div>
    </div>
  )
}

// ---------- Matrix ----------

function CineMatrix() {
  const ref = useRef<HTMLElement>(null)
  const p = useProgress(ref)
  const feats = [
    { k: 'Tasks from text', d: 'Deadlines and asks pulled from natural language.' },
    { k: 'Matter memory', d: 'Threads on the same subject cluster into one running context.' },
    { k: 'Priority score', d: 'Deadline + sender + age → 0–100. Explainable.' },
    { k: 'Morning digest', d: 'One summary at your hour. No push notifications, ever.' },
    { k: 'Retention rules', d: 'Noise expires automatically. You whitelist what matters.' },
    { k: 'Read-only', d: 'No send, delete, or modify. Revocable at Google.' },
  ]
  return (
    <section ref={ref} style={{ padding: '96px 36px' }}>
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>
        <div style={{ marginBottom: 72 }}>
          <Label>{'// CAPABILITIES'}</Label>
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
            Six primitives.
            <br />
            No decoration.
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

// ---------- Dashboard preview ----------

function CineDashboard() {
  const ref = useRef<HTMLElement>(null)
  const p = useProgress(ref)
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
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 72 }}>
          <Label>{'// THE WORKSPACE'}</Label>
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
            One screen.{' '}
            <em style={{ fontStyle: 'italic', color: 'var(--ef-signal)' }}>Every matter.</em>
          </h2>
        </div>
        <div
          style={{
            transform: `translateY(${(1 - clamp(p * 2)) * 40}px) scale(${0.95 + clamp(p * 2) * 0.05})`,
            opacity: clamp(p * 2),
            transition: 'none',
          }}
        >
          <DashboardMock />
        </div>
      </div>
    </section>
  )
}

function DashboardMock() {
  return (
    <div
      style={{
        border: '1px solid var(--ef-line)',
        borderRadius: 12,
        overflow: 'hidden',
        background: 'var(--ef-surface)',
        boxShadow: '0 40px 120px rgba(10,16,36,0.18)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderBottom: '1px solid var(--ef-line)',
          background: 'var(--ef-surface-2)',
        }}
      >
        <Dot c="#FF6B5B" size={8} />
        <Dot c="#F5B547" size={8} />
        <Dot c="var(--ef-signal)" size={8} />
        <span className="mono" style={{ fontSize: 11, color: 'var(--ef-ink-mute)', marginLeft: 12 }}>
          app.emailflow.ai/dashboard
        </span>
      </div>
      <Image
        src="/emailflow-dashboard.png"
        alt="EmailFlow AI workspace — dashboard view"
        width={1920}
        height={1080}
        priority
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
        }}
      />
    </div>
  )
}


function Dot({ c = 'var(--ef-signal)', size = 6 }: { c?: string; size?: number }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: 999,
        background: c,
        flexShrink: 0,
      }}
    />
  )
}

// ---------- Who ----------

function CineWho() {
  const roles: Array<[string, string]> = [
    ['Founders', 'Fundraise, customers, team asks — ranked by what moves the business.'],
    ['Operators', 'Vendors, finance, exec — one ordered queue across all of them.'],
    ['Project leads', 'Briefs, redlines, sign-offs — stitched to the project, not your inbox.'],
    ['Consultants', 'Parallel engagements without bleed. Every client gets its own context.'],
  ]
  return (
    <section style={{ padding: '96px 36px' }}>
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>
        <div style={{ marginBottom: 72 }}>
          <Label>{'// WHO IT&apos;S FOR'}</Label>
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
            For people whose inbox{' '}
            <em style={{ fontStyle: 'italic', color: 'var(--ef-signal)' }}>is</em> the job.
          </h2>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 0,
            borderTop: '1px solid var(--ef-line)',
          }}
        >
          {roles.map(([k, d], i) => (
            <div
              key={k}
              style={{
                padding: '44px 28px 36px',
                borderRight: i < 3 ? '1px solid var(--ef-line)' : 'none',
              }}
            >
              <div className="mono" style={{ fontSize: 11, color: 'var(--ef-signal)', fontWeight: 600, marginBottom: 20 }}>
                0{i + 1}
              </div>
              <h3
                className="serif"
                style={{
                  fontSize: 36,
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  margin: '0 0 14px',
                  fontStyle: 'italic',
                }}
              >
                {k}
              </h3>
              <p className="sans" style={{ fontSize: 14, color: 'var(--ef-ink-dim)', lineHeight: 1.55, margin: 0 }}>
                {d}
              </p>
            </div>
          ))}
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
        <Label>{'// BEGIN'}</Label>
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
          Two minutes.
          <br />
          <em style={{ fontStyle: 'italic', color: 'var(--ef-signal)' }}>First task by the third.</em>
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
            href="/dashboard"
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
            Open dashboard
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
              The inbox that clears itself.
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
            ● Read-only · revocable any time
          </span>
        </div>
      </div>
    </footer>
  )
}
