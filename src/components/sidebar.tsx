'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  CheckSquare,
  Mail,
  FileText,
  Settings,
  Zap,
} from 'lucide-react'
import { useAuth } from '@/lib/use-auth'
import { useQuery } from '@tanstack/react-query'
import { CACHE_TIME } from '@/lib/query-cache'
import { UpgradeModal } from '@/components/upgrade-modal'

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/dashboard/emails', label: 'Emails', icon: Mail },
  { href: '/dashboard/digest', label: 'Digest', icon: FileText },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export function Sidebar({
  mobileOpen,
  onMobileClose,
}: {
  mobileOpen: boolean
  onMobileClose: () => void
}) {
  const pathname = usePathname()
  const { user } = useAuth()
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  const { data: quotaRes } = useQuery({
    queryKey: ['quota'],
    queryFn: () => fetch('/api/settings/quota').then((r) => r.json()),
    staleTime: CACHE_TIME.stats,
    enabled: user?.plan === 'free',
  })
  const quota = quotaRes?.data

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-gray-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(248,250,252,0.98)_100%)] backdrop-blur transition-transform duration-200',
          'lg:sticky lg:top-0 lg:z-auto lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="border-b border-gray-200/80 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">EmailFlow</p>
              <span className="block truncate text-lg font-bold text-gray-900">AI Workspace</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1.5 px-3 py-5">
          {nav.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onMobileClose}
                className={cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100'
                    : 'text-gray-600 hover:bg-white hover:text-gray-900 hover:shadow-sm active:scale-[0.99]'
                )}
              >
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                    isActive
                      ? 'bg-white text-blue-600'
                      : 'bg-gray-100 text-gray-500 group-hover:bg-blue-50 group-hover:text-blue-600'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                </div>
                <span className="flex-1">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-gray-200/80 px-4 py-4">
          {user?.plan === 'pro' ? (
            <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600">
                <Zap className="h-3.5 w-3.5 text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold text-blue-700">Pro plan</p>
                <p className="text-[10px] text-blue-500">Unlimited access</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {quota && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400">Classification</span>
                    <span className="text-[10px] font-medium text-gray-500">
                      {quota.classify.used}/{quota.classify.limit}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        quota.classify.used / quota.classify.limit >= 0.9
                          ? 'bg-red-400'
                          : quota.classify.used / quota.classify.limit >= 0.7
                            ? 'bg-amber-400'
                            : 'bg-blue-400'
                      )}
                      style={{ width: `${Math.min(100, (quota.classify.used / quota.classify.limit) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              <button
                onClick={() => setUpgradeOpen(true)}
                className="flex w-full items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-left transition-colors hover:bg-blue-100"
              >
                <Zap className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-blue-700">Upgrade to Pro</p>
                  <p className="truncate text-[10px] text-blue-500">Remove all limits</p>
                </div>
              </button>
            </div>
          )}
        </div>

        <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
      </aside>
    </>
  )
}
