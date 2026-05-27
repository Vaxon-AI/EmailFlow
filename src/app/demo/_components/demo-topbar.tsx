'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Menu, Sparkles, User } from 'lucide-react'

const SECTION_LABELS: Record<string, string> = {
  demo: 'Dashboard',
  tasks: 'Tasks',
  emails: 'Emails',
  digest: 'Digest',
}

export function DemoTopbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)
  const sectionKey = segments[1] ?? 'demo'
  const sectionLabel = SECTION_LABELS[sectionKey] ?? 'Dashboard'

  return (
    <header
      style={{ top: 'var(--demo-banner-h, 0px)' }}
      className="sticky z-20 flex h-14 items-center justify-between border-b border-gray-200/80 bg-white/85 px-4 backdrop-blur lg:px-6"
    >
      <div className="flex min-w-0 items-center gap-2 text-sm text-gray-500">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open navigation"
          className="-ml-1 rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="font-medium text-gray-900">Workspace</span>
        <ChevronRight className="hidden h-4 w-4 text-gray-300 sm:block" />
        <span className="truncate">{sectionLabel}</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-600 sm:inline-flex">
          <Sparkles className="h-3 w-3" />
          Demo mode
        </span>
        <Link
          href="/auth/signup"
          className="hidden rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 sm:block"
        >
          Sign up free
        </Link>
        <div className="inline-flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white px-3 py-1.5 text-sm shadow-sm">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <User className="h-4 w-4" />
          </div>
          <span className="max-w-28 truncate">Demo</span>
        </div>
      </div>
    </header>
  )
}
