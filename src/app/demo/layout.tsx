'use client'

import { useState } from 'react'
import { SectionFade } from '@/components/page-transition'
import { DemoProvider } from '@/lib/demo/store'
import { DemoBanner } from './_components/demo-banner'
import { DemoSidebar } from './_components/demo-sidebar'
import { DemoTopbar } from './_components/demo-topbar'

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <DemoProvider>
      {/* Banner sits above a content area that itself is at least 100vh, so
          even with the banner on top the workspace always reads as a full
          page (banner becomes extra above the fold, not a chunk stolen
          from the viewport). */}
      <div className="flex flex-col bg-[linear-gradient(180deg,rgba(248,250,252,0.9)_0%,rgba(255,255,255,1)_240px)]">
        <DemoBanner />
        <div className="flex min-h-screen flex-1">
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
