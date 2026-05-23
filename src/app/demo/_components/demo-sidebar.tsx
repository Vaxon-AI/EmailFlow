'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CheckSquare, FileText, LayoutDashboard, Mail, Sparkles, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { href: '/demo', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/demo/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/demo/emails', label: 'Emails', icon: Mail },
  { href: '/demo/digest', label: 'Digest', icon: FileText },
]

export function DemoSidebar({
  mobileOpen,
  onMobileClose,
}: {
  mobileOpen: boolean
  onMobileClose: () => void
}) {
  const pathname = usePathname()

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
        <Link
          href="/demo"
          onClick={onMobileClose}
          className="block border-b border-gray-200/80 px-5 py-5 transition-colors hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 shadow-sm">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">EmailFlow</p>
              <span className="block truncate text-lg font-bold text-gray-900">AI Workspace</span>
            </div>
          </div>
          <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-600">
            <Sparkles className="h-2.5 w-2.5" />
            Demo
          </span>
        </Link>

        <nav className="flex-1 space-y-1.5 px-3 py-5">
          {nav.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/demo' && pathname.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onMobileClose}
                className={cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-brand-50 text-brand-700 shadow-sm ring-1 ring-brand-100'
                    : 'text-gray-600 hover:bg-white hover:text-gray-900 hover:shadow-sm active:scale-[0.99]',
                )}
              >
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                    isActive
                      ? 'bg-white text-brand-600'
                      : 'bg-gray-100 text-gray-500 group-hover:bg-brand-50 group-hover:text-brand-600',
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
          <div className="rounded-xl border border-brand-100 bg-brand-50 p-3.5">
            <p className="text-sm font-semibold text-brand-700">Like what you see?</p>
            <p className="mt-0.5 text-xs text-brand-500">
              Connect your own email account and EmailFlow does this for your real inbox.
            </p>
            <Link
              href="/auth/signup"
              className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
            >
              Create free account
            </Link>
          </div>
        </div>
      </aside>
    </>
  )
}
