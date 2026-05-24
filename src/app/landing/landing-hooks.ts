'use client'

import { useEffect, useState, type RefObject } from 'react'

export function useScrollY() {
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

export function useProgress(ref: RefObject<HTMLElement | null>) {
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

export function clamp(v: number, a = 0, b = 1) {
  return Math.max(a, Math.min(b, v))
}
