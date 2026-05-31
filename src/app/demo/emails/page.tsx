'use client'

import { Suspense, useCallback, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ChevronDown,
  EyeOff,
  FolderOpen,
  Inbox,
  Loader2,
  Search,
  Tag,
  X,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { SegmentedControl } from '@/components/segmented-control'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
type SortMode = 'newest' | 'oldest' | 'sender'

const TAB_VALUES: ReadonlySet<string> = new Set([
  'unclassified',
  'needs_action',
  'tracked',
  'fyi',
  'ignored',
])

function tabOf(email: DemoEmail): Tab {
  const state = displayStateOf(email)
  if (state === 'uncertain') return 'unclassified'
  return state
}

function parseTab(value: string | null): Tab {
  return value && TAB_VALUES.has(value) ? (value as Tab) : 'needs_action'
}

function countDemoEmailTabs(emails: DemoEmail[]): Record<Tab, number> {
  const counts: Record<Tab, number> = {
    unclassified: 0,
    needs_action: 0,
    tracked: 0,
    fyi: 0,
    ignored: 0,
  }
  for (const email of emails) counts[tabOf(email)] += 1
  return counts
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
    getProject,
    classifyEmail,
    setEmailActioned,
    simulateExtractTask,
  } = useDemoStore()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = parseTab(searchParams.get('tab'))
  const focusIdentityId = searchParams.get('identity') ?? undefined
  const focusProjectId = searchParams.get('project') ?? undefined
  const [searchQuery, setSearchQuery] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('newest')

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

  const counts = useMemo(() => countDemoEmailTabs(emails), [emails])
  const [seenCounts, setSeenCounts] = useState<Record<Tab, number>>(() => countDemoEmailTabs(emails))

  const newCounts = useMemo(() => {
    const seen = seenCounts
    return {
      unclassified: tab === 'unclassified' ? 0 : Math.max(0, counts.unclassified - seen.unclassified),
      needs_action: tab === 'needs_action' ? 0 : Math.max(0, counts.needs_action - seen.needs_action),
      tracked: tab === 'tracked' ? 0 : Math.max(0, counts.tracked - seen.tracked),
      fyi: tab === 'fyi' ? 0 : Math.max(0, counts.fyi - seen.fyi),
      ignored: 0,
    } satisfies Record<Tab, number>
  }, [counts, seenCounts, tab])

  const setTab = useCallback((next: Tab) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', next)
    router.replace(`/demo/emails?${params.toString()}`, { scroll: false })
    setSeenCounts((prev) => ({ ...prev, [next]: counts[next] }))
  }, [counts, router, searchParams])

  const visible = useMemo(() => {
    let result = emails.filter((e) => tabOf(e) === tab)
    if (focusProjectId) result = result.filter((e) => e.projectId === focusProjectId)
    else if (focusIdentityId) {
      result = result.filter((e) => getProject(e.projectId)?.identityId === focusIdentityId)
    }
    if (fromDate) {
      const from = new Date(`${fromDate}T00:00:00`)
      result = result.filter((e) => new Date(e.receivedAt) >= from)
    }
    if (toDate) {
      const to = new Date(`${toDate}T23:59:59`)
      result = result.filter((e) => new Date(e.receivedAt) <= to)
    }
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      result = result.filter((e) =>
        [e.subject, e.senderName, e.sender, e.bodyPreview].some((value) => value.toLowerCase().includes(q))
      )
    }
    return [...result].sort((a, b) => {
      if (sortMode === 'sender') return a.senderName.localeCompare(b.senderName)
      const diff = new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
      return sortMode === 'oldest' ? diff : -diff
    })
  }, [emails, focusIdentityId, focusProjectId, fromDate, getProject, searchQuery, sortMode, tab, toDate])

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

  const badge = (n: number, bucket: Tab) =>
    bucket !== 'ignored' && n > 0 ? (
      <span className="rounded-full bg-critical px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
        +{n}
      </span>
    ) : undefined

  // Unclassified leads when present — mirrors the real inbox (L610-619).
  const options = [
    ...(counts.unclassified > 0
      ? [
          {
            value: 'unclassified',
            label: 'Needs Review',
            badge: badge(newCounts.unclassified, 'unclassified'),
          },
        ]
      : []),
    { value: 'needs_action', label: 'Needs Action', badge: badge(newCounts.needs_action, 'needs_action') },
    { value: 'tracked', label: 'Tracked', badge: badge(newCounts.tracked, 'tracked') },
    { value: 'fyi', label: 'FYI', badge: badge(newCounts.fyi, 'fyi') },
    { value: 'ignored', label: 'Ignored' },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inbox"
        description="Review incoming emails, grouped by matter and linked tasks."
        meta={`${emails.length} emails · ${counts.needs_action} need action`}
      />

      <SegmentedControl value={tab} onChange={(v) => setTab(v as Tab)} options={options} />

      <div className="rounded-2xl border border-white/70 bg-white/90 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-gray-200 bg-white pl-9"
            />
          </div>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-600"
            aria-label="Email from date"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-600"
            aria-label="Email to date"
          />
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600"
            aria-label="Sort emails"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="sender">Sender A-Z</option>
          </select>
        </div>
      </div>

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
