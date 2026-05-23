'use client'

import { Suspense, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/use-auth'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RefreshCw, User, LogOut, ChevronRight, AlertTriangle, Loader2, Menu } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { useSyncSetup } from '@/components/sync-setup/sync-setup-provider'

type SyncStateKind = 'fresh' | 'stale' | 'never'
type SyncStateRes = {
  data?: { state?: { kind?: string; lastSyncAt?: string; daysSince?: number } }
}

export function Header({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const { openSyncSetup, runSync, syncPending } = useSyncSetup()
  const [gating, setGating] = useState(false)

  const segments = pathname.split('/').filter(Boolean)
  const currentSection = segments[1] ? segments[1].replace(/-/g, ' ') : 'dashboard'
  const sectionLabel = currentSection.charAt(0).toUpperCase() + currentSection.slice(1)

  // Quota_skipped emails — surfaces as a chip in the right side of header so
  // users can click in from any dashboard route. queryKey starts with 'emails'
  // so isWorkspaceQueryKey invalidates it on sync mutations.
  const { data: unclassifiedRes } = useQuery<{ data: { count: number } }>({
    queryKey: ['emails', 'unclassified-count'],
    queryFn: () => fetch('/api/emails/unclassified-count').then((r) => r.json()),
    staleTime: 0,
  })
  const unclassifiedCount = unclassifiedRes?.data?.count ?? 0

  // Pre-warm the sync-state cache so the click → modal-or-sync decision feels
  // instant. Staletime keeps us from hammering /api/sync/state.
  const { refetch: refetchSyncState } = useQuery<SyncStateRes>({
    queryKey: ['sync-state'],
    queryFn: () => fetch('/api/sync/state').then((r) => r.json()),
    enabled: !!user,
    staleTime: 60_000,
  })

  const onSyncClick = async () => {
    if (syncPending || gating) return
    setGating(true)
    try {
      // Force-fresh read — we don't want a stale cached 'fresh' to send us
      // straight into a full sync if the user actually crossed the 7-day line.
      const res = await refetchSyncState()
      const kind = (res.data?.data?.state?.kind ?? 'never') as SyncStateKind
      if (kind === 'fresh') {
        runSync()
      } else {
        // stale → "Welcome back" + preview; never → first-time setup. Both go
        // through the same modal, with the modal deciding what to show.
        openSyncSetup('header-sync')
      }
    } catch {
      // If state lookup fails, fall back to the safe path — open the modal
      // so the user picks a window instead of triggering a full sync blind.
      openSyncSetup('header-sync')
    } finally {
      setGating(false)
    }
  }

  const busy = syncPending || gating

  return (
    <>
      <Suspense fallback={null}>
        <RunSyncOnQueryParam
          pathname={pathname}
          router={router}
          pending={busy}
          onTrigger={runSync}
        />
      </Suspense>
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-gray-200/80 bg-white/85 px-4 backdrop-blur lg:px-6">
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
          {unclassifiedCount > 0 && (
            <button
              type="button"
              onClick={() => router.push('/dashboard/emails?tab=unclassified')}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-warning-200 bg-yellow-50/80 px-3 text-sm font-semibold text-warning-700 shadow-sm transition-all hover:-translate-y-px hover:border-warning-200 hover:bg-warning-100/70 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/20"
              title="Emails AI couldn't categorize on its own — open to classify manually"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{unclassifiedCount} unclassified</span>
            </button>
          )}
          <button
            onClick={onSyncClick}
            disabled={busy}
            title={busy ? 'Syncing...' : 'Sync emails'}
            className={cn(
              'rounded-full border border-transparent p-2 text-gray-400 transition-colors hover:border-brand-100 hover:bg-brand-50 hover:text-brand-600 disabled:opacity-40'
            )}
          >
            {gating && !syncPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className={cn('h-4 w-4', syncPending && 'animate-spin')} />
            )}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white px-3 py-1.5 text-sm shadow-sm transition-colors hover:bg-gray-50">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <User className="h-4 w-4" />
              </div>
              <span className="max-w-28 truncate">{user?.name || 'User'}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => logout()}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </>
  )
}

// Legacy deep-link compat: the old dashboard modal used to redirect to
// /dashboard?run_sync=1 after the user picked a window. The new flow triggers
// the mutation in-place via the provider, but we keep this handler so any
// outstanding link / OAuth callback that still sets run_sync=1 keeps working.
function RunSyncOnQueryParam({
  pathname,
  router,
  onTrigger,
  pending,
}: {
  pathname: string
  router: ReturnType<typeof useRouter>
  onTrigger: () => void
  pending: boolean
}) {
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('run_sync') !== '1') return
    if (pending) return
    const params = new URLSearchParams(searchParams.toString())
    params.delete('run_sync')
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    onTrigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  return null
}
