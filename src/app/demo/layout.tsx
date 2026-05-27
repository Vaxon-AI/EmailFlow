'use client'

import { useEffect, useRef, useState } from 'react'
import { SectionFade } from '@/components/page-transition'
import { DemoProvider } from '@/lib/demo/store'
import { DemoBanner } from './_components/demo-banner'
import { DemoSidebar } from './_components/demo-sidebar'
import { DemoTopbar } from './_components/demo-topbar'

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const bannerRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // Banner is sticky and wraps to two rows on narrow screens, so its height is
  // dynamic. Mirror it into --demo-banner-h so the sidebar and topbar can offset
  // and size themselves correctly (sidebar h = 100svh - banner-h, sticky top =
  // banner-h). Without this, the sidebar overflows the viewport and its footer
  // CTA gets cut off.
  useEffect(() => {
    const banner = bannerRef.current
    const root = rootRef.current
    if (!banner || !root) return
    const update = () => {
      root.style.setProperty('--demo-banner-h', `${banner.offsetHeight}px`)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(banner)
    return () => ro.disconnect()
  }, [])

  return (
    <DemoProvider>
      <div
        ref={rootRef}
        style={{ '--demo-banner-h': '36px' } as React.CSSProperties}
        className="flex min-h-screen flex-col bg-[linear-gradient(180deg,rgba(248,250,252,0.9)_0%,rgba(255,255,255,1)_240px)]"
      >
        <DemoBanner ref={bannerRef} />
        <div className="flex flex-1">
          <DemoSidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
          <div className="flex min-w-0 flex-1 flex-col">
            <DemoTopbar onOpenMobileNav={() => setMobileNavOpen(true)} />
            <main className="flex-1 px-4 pb-12 pt-6 lg:px-6">
              <SectionFade>{children}</SectionFade>
            </main>
          </div>
        </div>
      </div>
    </DemoProvider>
  )
}
