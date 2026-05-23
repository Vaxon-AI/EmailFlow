'use client'

import { Suspense, useCallback, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ChevronDown,
  EyeOff,
  FolderOpen,
  Inbox,
  Loader2,
  Tag,
  X,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { SegmentedControl } from '@/components/segmented-control'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EMAIL_BUCKET_CONFIG, type EmailBucket } from '@/lib/email-classification'
import { useDemoStore } from '@/lib/demo/store'
import type { DemoEmail } from '@/lib/demo/types'
import { DemoEmailMatterView } from '../_components/demo-email-matter-view'
import { DemoBatchReassignModal } from '../_components/demo-batch-reassign-modal'
import { displayStateOf, EmptyHint } from '../_components/demo-bits'

// Mirrors the real inbox (src/app/dashboard/emails) — five mutually-exclusive
// buckets, no "All Mail" tab. Unclassified only appears when it has emails.
type Tab = 'unclassified' | 'needs_action' | 'tracked' | 'fyi' | 'ignored'

const TAB_VALUES: ReadonlySet<string> = new Set([
  'unclassified',
  'needs_action',
  'tracked',
  'fyi',
  'ignored',
])

function tabOf(email: DemoEmail): Tab {
  const state = displayStateOf(email)
  return state
}

function parseTab(value: string | null): Tab {
  return value && TAB_VALUES.has(value) ? (value as Tab) : 'needs_action'
}

export default function DemoEmailsPage() {
  return (
    <Suspense fallback={null}>
      <EmailsContent />
    </Suspense>
  )
}

function EmailsContent() {
  const {
    emails,
    classifyEmail,
    setEmailActioned,
    simulateExtractTask,
  } = useDemoStore()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = parseTab(searchParams.get('tab'))
  const focusIdentityId = searchParams.get('identity') ?? undefined

  // Selection state scoped to active tab — switching tabs clears it
  // (mirrors real emails page L273-281).
  const [selection, setSelection] = useState<{ tab: Tab; ids: Set<string> }>({
    tab,
    ids: new Set(),
  })
  // Memoised so the empty-Set fallback doesn't recreate on every render and
  // doesn't churn useMemos that depend on selectedIds.
  const selectedIds = useMemo<Set<string>>(
    () => (selection.tab === tab ? selection.ids : new Set<string>()),
    [selection, tab],
  )
  const setSelectedIds = useCallback(
    (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      setSelection((prev) => {
        const current = prev.tab === tab ? prev.ids : new Set<string>()
        const ids = typeof updater === 'function' ? updater(current) : updater
        return { tab, ids }
      })
    },
    [tab],
  )

  const [showBatchReassign, setShowBatchReassign] = useState(false)
  const [generating, setGenerating] = useState(false)

  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', next)
    router.replace(`/demo/emails?${params.toString()}`, { scroll: false })
  }

  const counts = useMemo(() => {
    const c: Record<Tab, number> = {
      unclassified: 0,
      needs_action: 0,
      tracked: 0,
      fyi: 0,
      ignored: 0,
    }
    for (const e of emails) c[tabOf(e)] += 1
    return c
  }, [emails])

  const visible = useMemo(() => emails.filter((e) => tabOf(e) === tab), [emails, tab])

  const toggleSelect = useCallback(
    (id: string) =>
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    [setSelectedIds],
  )

  const bulkToggle = useCallback(
    (ids: string[], select: boolean) =>
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (select) ids.forEach((id) => next.add(id))
        else ids.forEach((id) => next.delete(id))
        return next
      }),
    [setSelectedIds],
  )

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [setSelectedIds])
  const selectAll = () => setSelectedIds(new Set(visible.map((e) => e.id)))

  // Generate Tasks — only operates on action emails not yet actioned
  // (uncertain emails need confirmation first, matches real L972-1003).
  const eligibleForGenerate = useMemo(() => {
    const selectedSet = selectedIds
    return visible.filter(
      (e) => selectedSet.has(e.id) && e.classification === 'action' && !e.actioned,
    )
  }, [visible, selectedIds])
  const uncertainSelected = useMemo(
    () =>
      visible.filter(
        (e) => selectedIds.has(e.id) && e.classification === 'uncertain' && !e.actioned,
      ).length,
    [visible, selectedIds],
  )

  const handleGenerateTasks = async () => {
    if (eligibleForGenerate.length === 0) return
    setGenerating(true)
    for (const email of eligibleForGenerate) {
      await simulateExtractTask(email.id)
    }
    setGenerating(false)
    toast.success(
      `Queued ${eligibleForGenerate.length} task${eligibleForGenerate.length === 1 ? '' : 's'}`,
    )
    clearSelection()
  }

  const handleBulkIgnore = () => {
    const ids = [...selectedIds]
    for (const id of ids) {
      classifyEmail(id, 'ignore')
      setEmailActioned(id, false)
    }
    toast.success(`Ignored ${ids.length} email${ids.length === 1 ? '' : 's'}`)
    clearSelection()
  }

  const handleBulkMarkAs = (bucket: EmailBucket) => {
    const ids = [...selectedIds]
    for (const id of ids) {
      if (bucket === 'needs_action') {
        classifyEmail(id, 'action')
        setEmailActioned(id, false)
      } else if (bucket === 'tracked') {
        setEmailActioned(id, true)
      } else if (bucket === 'fyi') {
        classifyEmail(id, 'awareness')
        setEmailActioned(id, false)
      } else {
        classifyEmail(id, 'ignore')
        setEmailActioned(id, false)
      }
    }
    toast.success(
      `Marked ${ids.length} email${ids.length === 1 ? '' : 's'} as ${EMAIL_BUCKET_CONFIG[bucket].label}`,
    )
    clearSelection()
  }

  const badge = (n: number, active: boolean) => (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
        active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {n}
    </span>
  )

  // Unclassified leads when present — mirrors the real inbox (L610-619).
  const options = [
    ...(counts.unclassified > 0
      ? [
          {
            value: 'unclassified',
            label: 'Unclassified',
            badge: badge(counts.unclassified, tab === 'unclassified'),
          },
        ]
      : []),
    { value: 'needs_action', label: 'Needs Action', badge: badge(counts.needs_action, tab === 'needs_action') },
    { value: 'tracked', label: 'Tracked', badge: badge(counts.tracked, tab === 'tracked') },
    { value: 'fyi', label: 'FYI', badge: badge(counts.fyi, tab === 'fyi') },
    { value: 'ignored', label: 'Ignored', badge: badge(counts.ignored, tab === 'ignored') },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inbox"
        description="Review incoming emails, grouped by matter and linked tasks."
        meta={`${emails.length} emails · ${counts.needs_action} need action`}
      />

      <SegmentedControl value={tab} onChange={(v) => setTab(v as Tab)} options={options} />

      {/* Batch action bar — only when something is selected. Mirrors real
          emails page L965-1049. */}
      {selectedIds.size > 0 && (
        <div className="animate-soft-enter flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/75 px-4 py-2.5 shadow-sm">
          <span className="text-sm font-medium text-brand-700">{selectedIds.size} selected</span>
          {selectedIds.size < visible.length && (
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-brand-500 hover:text-brand-700 hover:underline"
            >
              Select all {visible.length}
            </button>
          )}
          <div className="flex-1" />
          <Button
            size="sm"
            variant="warning"
            className="h-7 gap-1 text-xs"
            disabled={eligibleForGenerate.length === 0 || generating}
            onClick={handleGenerateTasks}
            title={
              eligibleForGenerate.length === 0
                ? 'No Needs Action emails selected'
                : `Extract tasks from ${eligibleForGenerate.length} email${eligibleForGenerate.length === 1 ? '' : 's'}`
            }
          >
            {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            Generate Tasks
            {eligibleForGenerate.length > 0 && eligibleForGenerate.length < selectedIds.size
              ? ` (${eligibleForGenerate.length})`
              : ''}
          </Button>
          {uncertainSelected > 0 && (
            <span className="text-xs text-warning-700">
              {uncertainSelected} uncertain email{uncertainSelected === 1 ? '' : 's'} skipped until
              you confirm the classification.
            </span>
          )}
          <Button
            size="sm"
            variant="utility"
            className="h-7 gap-1 text-xs"
            onClick={handleBulkIgnore}
          >
            <EyeOff className="h-3 w-3" />
            Ignore
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger className="group/trigger inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 shadow-sm transition-all hover:-translate-y-px hover:border-brand-200 hover:bg-brand-50/70 hover:text-brand-700 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 aria-expanded:border-brand-300 aria-expanded:bg-brand-50 aria-expanded:text-brand-700">
              <Tag className="h-3 w-3" />
              Mark as
              <ChevronDown className="h-3 w-3 transition-transform duration-150 group-aria-expanded/trigger:rotate-180" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {(Object.keys(EMAIL_BUCKET_CONFIG) as EmailBucket[]).map((bucket) => (
                <DropdownMenuItem
                  key={bucket}
                  onClick={() => handleBulkMarkAs(bucket)}
                  className="cursor-pointer"
                >
                  {EMAIL_BUCKET_CONFIG[bucket].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="utility"
            className="h-7 gap-1 text-xs"
            onClick={() => setShowBatchReassign(true)}
          >
            <FolderOpen className="h-3 w-3" />
            Change Project
          </Button>
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Clear selection"
            className="ml-1 rounded p-1 text-brand-400 hover:bg-brand-100 hover:text-brand-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyHint icon={<Inbox className="h-5 w-5" />} text="No emails in this view." />
      ) : (
        <DemoEmailMatterView
          emails={visible}
          focusIdentityId={focusIdentityId}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onBulkToggle={bulkToggle}
        />
      )}

      <DemoBatchReassignModal
        open={showBatchReassign}
        onOpenChange={setShowBatchReassign}
        ids={[...selectedIds]}
        entity="email"
        onSuccess={clearSelection}
      />
    </div>
  )
}
