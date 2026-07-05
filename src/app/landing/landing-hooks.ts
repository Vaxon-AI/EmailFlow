'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'

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

export function useIsMobile(breakpoint = 768) {
  // SSR / first paint defaults to false (desktop-first) to avoid hydration flicker.
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const on = () => setIsMobile(mql.matches)
    on()
    mql.addEventListener('change', on)
    return () => mql.removeEventListener('change', on)
  }, [breakpoint])
  return isMobile
}

export function useInViewProgress(durationMs = 1800, threshold = 0.3) {
  // Ramps 0 → 1 over `durationMs` once the element first enters the viewport.
  const ref = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        io.disconnect()
        const start = performance.now()
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / durationMs)
          setProgress(t)
          if (t < 1) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      },
      { threshold },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [durationMs, threshold])
  return [ref, progress] as const
}

export function clamp(v: number, a = 0, b = 1) {
  return Math.max(a, Math.min(b, v))
}
