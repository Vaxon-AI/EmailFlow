'use client'

import type { CSSProperties, ReactNode } from 'react'

export function LogoMark() {
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

export function Label({ children, style }: { children: ReactNode; style?: CSSProperties }) {
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
