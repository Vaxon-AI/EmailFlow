'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { clamp, useIsMobile, useProgress } from './landing-hooks'
import { HeroPipeline } from './landing-hero-pipeline'

export function CineHero() {
  const ref = useRef<HTMLElement>(null)
  const p = useProgress(ref)
  const isMobile = useIsMobile()

  return (
    <section ref={ref} style={{ position: 'relative', minHeight: '100vh', paddingTop: 100 }}>
      <HeroBackdrop p={p} />
      <div
        style={{
          maxWidth: 1360,
          margin: '0 auto',
          padding: isMobile ? '40px 20px 32px' : '60px 36px 48px',
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
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: isMobile ? 32 : 60,
            alignItems: 'end',
            marginTop: isMobile ? 36 : 60,
          }}
        >
          <p
            className="sans"
            style={{ fontSize: 19, lineHeight: 1.55, color: 'var(--ef-ink-dim)', margin: 0, maxWidth: 520 }}
          >
            Long threads. Buried asks. Deadlines you notice only once they&apos;re late. EmailFlow AI reads every
            thread, pulls out the real tasks, and ranks what needs you first.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: isMobile ? 'flex-start' : 'flex-end' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
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
                Connect email →
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
