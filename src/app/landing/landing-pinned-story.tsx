'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { clamp, useInViewProgress, useIsMobile } from './landing-hooks'
import { Label } from './landing-shared'

const STORY_TITLES = ['Read.', 'Understand.', 'List.', 'Rank.']
const STORY_DESCS = [
  'EmailFlow connects to your inbox and reads it — that is all it can do. New email gets picked up automatically.',
  'It reads each email the way you would: who is asking, what they need, and by when. The real requests get separated from the noise.',
  'Every real request becomes a task — with its deadline, who it is for, and the original email attached so you never lose the context.',
  'Each task is ranked by how urgent it is, so you get one clear list. Start at the top and work your way down.',
]

function MobileAct({ index }: { index: number }) {
  // Plays the act's reveal animation once when the card scrolls into view.
  const [ref, subP] = useInViewProgress()
  const Act = [Act1Read, Act2Understand, Act3Extract, Act4Rank][index]
  return (
    <div
      ref={ref}
      style={{
        height: 'min(540px, 80vh)',
        border: '1px solid var(--ef-line)',
        borderRadius: 20,
        background: 'var(--ef-surface)',
        overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(10,16,36,0.07)',
        padding: 20,
      }}
    >
      <Act subP={subP} />
    </div>
  )
}

function MobilePinnedStory() {
  // No scroll-jacking on mobile: stack the four acts as normal sections.
  return (
    <section style={{ position: 'relative', padding: '64px 20px', background: 'var(--ef-base)' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <Label>HOW IT WORKS</Label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 56, marginTop: 28 }}>
          {STORY_TITLES.map((title, i) => (
            <div key={title} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--ef-signal)', letterSpacing: '0.14em', fontWeight: 600, marginBottom: 10 }}>
                  STEP {i + 1} OF 4
                </div>
                <div className="serif" style={{ fontSize: 'clamp(40px, 12vw, 56px)', lineHeight: 1, letterSpacing: '-0.03em', fontWeight: 400 }}>
                  {title}
                </div>
                <p className="sans" style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--ef-ink-dim)', margin: '14px 0 0' }}>
                  {STORY_DESCS[i]}
                </p>
              </div>
              <MobileAct index={i} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function CinePinnedStory() {
  const isMobile = useIsMobile()
  // Section is 500vh tall in the document flow. The inner div uses
  // `position: sticky; top: 0` so it pins to the viewport while we scroll
  // through the remaining 400vh — that 400vh window drives the act/subP
  // progression. No nested scroll container, so the page's natural scroll
  // (and trackpad/wheel momentum) is never interrupted.
  const sectionRef = useRef<HTMLElement>(null)
  const [act, setAct] = useState(0)
  const [subP, setSubP] = useState(0)

  useEffect(() => {
    if (isMobile) return
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
  }, [isMobile])

  if (isMobile) return <MobilePinnedStory />

  const titles = STORY_TITLES
  const descs = STORY_DESCS

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
          Email · Inbox
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
