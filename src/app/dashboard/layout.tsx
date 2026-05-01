'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/use-auth'
import { useSessionRotation } from '@/lib/use-session-rotation'
import { Sidebar } from '@/components/sidebar'
import { Header } from '@/components/header'
import { SectionFade } from '@/components/page-transition'
import { StatePanel } from '@/components/state-panel'
import { CACHE_TIME } from '@/lib/query-cache'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const { isAuthenticated, isLoading } = useAuth()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  useSessionRotation(isAuthenticated)

  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/auth/signin')
    }
  }, [isLoading, isAuthenticated, router])

  useEffect(() => {
    if (!isAuthenticated) return

    const prefetchWorkspace = () => {
      void queryClient.prefetchQuery({
        queryKey: ['dashboard-summary'],
        queryFn: () => fetch('/api/dashboard/summary').then((r) => r.json()),
        staleTime: CACHE_TIME.stats,
      })
      void queryClient.prefetchQuery({
        queryKey: ['tasks', '', 'priority'],
        queryFn: () => fetch('/api/tasks?status=&sort=priority&limit=50').then((r) => r.json()),
        staleTime: CACHE_TIME.list,
      })
      void queryClient.prefetchQuery({
        queryKey: ['projects'],
        queryFn: () => fetch('/api/projects').then((r) => r.json()),
        staleTime: CACHE_TIME.list,
      })
      void queryClient.prefetchQuery({
        queryKey: ['emails', 1],
        queryFn: () => fetch('/api/emails?page=1&limit=50').then((r) => r.json()),
        staleTime: CACHE_TIME.list,
      })
      void queryClient.prefetchQuery({
        queryKey: ['digests'],
        queryFn: () => fetch('/api/digest?limit=20').then((r) => r.json()),
        staleTime: CACHE_TIME.list,
      })
    }

    const browserWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }

    if (browserWindow.requestIdleCallback && browserWindow.cancelIdleCallback) {
      const idleId = browserWindow.requestIdleCallback(prefetchWorkspace, { timeout: 3000 })
      return () => browserWindow.cancelIdleCallback?.(idleId)
    }

    const timeoutId = globalThis.setTimeout(prefetchWorkspace, 1000)
    return () => globalThis.clearTimeout(timeoutId)
  }, [isAuthenticated, queryClient])

  if (!isLoading && !isAuthenticated) {
    return (
      <div className="mx-auto flex h-screen w-full max-w-xl items-center px-6">
        <StatePanel
          loading
          title="Redirecting to sign in"
          description="Your session could not be verified."
          className="w-full"
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[linear-gradient(180deg,rgba(248,250,252,0.9)_0%,rgba(255,255,255,1)_240px)]">
      <Sidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="min-h-[calc(100vh-3.5rem)] flex-1 px-4 pb-10 pt-6 lg:px-6">
          <SectionFade>{children}</SectionFade>
        </main>
      </div>
    </div>
  )
}
