'use client'

import Link from 'next/link'
import { useScrollY } from './landing-hooks'
import { LogoMark } from './landing-shared'

export function CineNav() {
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
            Connect email
          </Link>
        </nav>
      </div>
    </header>
  )
}
