'use client'

import Link from 'next/link'
import { useIsMobile } from './landing-hooks'
import { Label, LogoMark } from './landing-shared'

export function CineCTA() {
  const isMobile = useIsMobile()
  return (
    <section style={{ padding: isMobile ? '72px 20px' : '100px 36px', position: 'relative' }}>
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
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
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
            Connect email →
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

export function CineFooter() {
  const isMobile = useIsMobile()
  return (
    <footer style={{ borderTop: '1px solid var(--ef-line-soft)', padding: isMobile ? '48px 20px 32px' : '56px 36px 32px' }}>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
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
