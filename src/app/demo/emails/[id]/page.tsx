'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowUpRight,
  CheckSquare,
  ChevronRight,
  Clock,
  Copy,
  EyeOff,
  FolderOpen,
  Loader2,
  Mail,
  Paperclip,
  RefreshCw,
  Shield,
  Sparkles,
  Tag,
  UserRound,
  Wand2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { StatePanel } from '@/components/state-panel'
import {
  EMAIL_BUCKET_CONFIG,
  EMAIL_DISPLAY_CONFIG,
  EMAIL_DETAIL_TONE,
  EMAIL_DETAIL_HEADER_BG,
  type EmailBucket,
} from '@/lib/email-classification'
import { getPriorityBand, getPriorityColor, getPriorityLabel } from '@/types'
import { useDemoStore } from '@/lib/demo/store'
import { cn } from '@/lib/utils'
import { displayStateOf, TASK_STATUS_CONFIG } from '../../_components/demo-bits'

export default function DemoEmailDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const store = useDemoStore()
  const email = store.getEmail(params.id)

  const [replyLoading, setReplyLoading] = useState(false)
  const [extractLoading, setExtractLoading] = useState(false)
  const [ignoring, setIgnoring] = useState(false)
  const [classifying, setClassifying] = useState(false)

  if (!email) {
    return (
      <div className="space-y-4">
        <Link
          href="/demo/emails"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to inbox
        </Link>
        <StatePanel
          icon={<Mail className="h-5 w-5 text-gray-400" />}
          title="Email not found"
          description="This email isn't part of the demo workspace."
        />
      </div>
    )
  }

  const state = displayStateOf(email)
  const cfg = EMAIL_DISPLAY_CONFIG[state]
  const ClsIcon = cfg.icon
  // Use the detail-page tones (lighter tint) — see EMAIL_DETAIL_TONE in
  // src/lib/email-classification.ts. The default cfg.color is a solid
  // fill meant for list chips, which over-saturates a full banner.
  const detailTone = EMAIL_DETAIL_TONE[state]
  const detailHeaderBg = EMAIL_DETAIL_HEADER_BG[state]
  const project = store.getProject(email.projectId)
  const identity = store.getIdentity(project?.identityId)
  const matter = store.getMatter(email.matterId)
  const linkedTasks = store.tasksForEmail(email.id)
  const canExtractTask = email.classification === 'action' || email.classification === 'uncertain'
  const canShowReplyDraft =
    email.classification === 'action' ||
    email.classification === 'uncertain' ||
    linkedTasks.length > 0 ||
    !!email.aiReplyDraft
  const hasAiAnalysis = !!email.classReasoning && email.classConfidence !== null
  const pickerValue: EmailBucket | '' = state === 'unclassified' ? '' : state

  const generateReply = async () => {
    setReplyLoading(true)
    await store.simulateReplyDraft(email.id)
    setReplyLoading(false)
    toast.success('Reply draft generated')
  }

  const copyReply = async () => {
    if (!email.aiReplyDraft) return
    try {
      await navigator.clipboard.writeText(email.aiReplyDraft)
      toast.success('Draft copied')
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  const extractTask = async () => {
    setExtractLoading(true)
    await store.simulateExtractTask(email.id)
    setExtractLoading(false)
    toast.success('Task extracted from this email')
  }

  const handleIgnore = () => {
    setIgnoring(true)
    store.classifyEmail(email.id, 'ignore')
    store.setEmailActioned(email.id, false)
    toast.success('Email ignored')
    router.push('/demo/emails')
  }

  const setBucket = (bucket: EmailBucket) => {
    if (bucket === state) return
    setClassifying(true)
    if (bucket === 'needs_action') {
      store.classifyEmail(email.id, 'action')
      store.setEmailActioned(email.id, false)
    } else if (bucket === 'tracked') {
      store.setEmailActioned(email.id, true)
    } else if (bucket === 'fyi') {
      store.classifyEmail(email.id, 'awareness')
      store.setEmailActioned(email.id, false)
    } else {
      store.classifyEmail(email.id, 'ignore')
      store.setEmailActioned(email.id, false)
    }
    setTimeout(() => setClassifying(false), 200)
    toast.success(`Marked as ${EMAIL_BUCKET_CONFIG[bucket].label}`)
  }

  const senderInitial = (email.senderName || 'U')[0].toUpperCase()

  return (
    <div className="animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <Link
          href="/demo/emails"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to inbox
        </Link>
        {!email.actioned && email.classification !== 'ignore' && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleIgnore}
            disabled={ignoring}
            className="gap-1.5 text-gray-600 hover:bg-gray-50"
          >
            {ignoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
            Ignore
          </Button>
        )}
      </div>

      <div className="mx-auto mt-2 max-w-6xl space-y-5">
        <PageHeader
          title={email.subject}
          description="Review the message, linked work, and AI classification in one place."
          meta={`From ${email.senderName} • ${new Date(email.receivedAt).toLocaleString('en', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}`}
        />

        {/* Identity / Project / Matter breadcrumb */}
        <div className="flex w-full items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-2.5">
          <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="text-xs font-medium text-slate-500">{identity?.name ?? 'Unassigned'}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="text-xs font-semibold text-slate-700">{project?.name ?? 'Uncategorized'}</span>
          {matter && (
            <>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
              <span className="text-xs text-slate-500">{matter.title}</span>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          {/* LEFT */}
          <div className="space-y-4">
            {/* Header card */}
            <Card className={cn('overflow-hidden border-white/70 bg-gradient-to-br shadow-sm', detailHeaderBg)}>
              <CardContent className="space-y-4 py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={cn('gap-1', detailTone)}>
                    <ClsIcon className="h-3 w-3" />
                    {cfg.label}
                  </Badge>
                  {email.hasAttachments && (
                    <Badge variant="outline" className="gap-1 border-gray-200 bg-white/60 text-[10px] text-gray-500">
                      <Paperclip className="h-3 w-3" />
                      Attachments
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-3 rounded-xl border border-white bg-white/85 px-4 py-3 backdrop-blur-sm">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                    {senderInitial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">{email.senderName}</p>
                    <p className="text-xs text-gray-500">{email.sender}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      {new Date(email.receivedAt).toLocaleString('en', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </div>
                    <p className="mt-0.5 text-[10px] text-gray-400">To: {email.recipients}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Email body */}
            <Card className="border-white/70 bg-white/95 shadow-sm">
              <CardContent className="py-5">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{email.bodyFull}</p>
              </CardContent>
            </Card>

            {/* AI reply draft */}
            {canShowReplyDraft && (
              <Card className="border-warning-100/50 bg-gradient-to-br from-yellow-50/35 via-white to-white shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Sparkles className="h-4 w-4 text-warning/75" />
                      AI Reply Draft
                    </CardTitle>
                    {email.aiReplyGeneratedAt && (
                      <span className="text-[10px] font-medium text-slate-400">
                        Generated{' '}
                        {new Date(email.aiReplyGeneratedAt).toLocaleDateString('en', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs leading-5 text-slate-500">
                    Drafts use this email plus linked task status and notes. Nothing is sent automatically — and
                    in this demo, nothing is sent at all.
                  </p>
                  {email.aiReplyDraft ? (
                    <>
                      <textarea
                        value={email.aiReplyDraft}
                        onChange={(e) => store.updateEmail(email.id, { aiReplyDraft: e.target.value })}
                        rows={8}
                        className="w-full resize-y rounded-lg border border-warning-200/70 bg-white px-3 py-2 text-sm leading-6 shadow-sm outline-none focus:border-warning-200 focus:ring-2 focus:ring-warning/20"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="warning"
                          onClick={generateReply}
                          disabled={replyLoading}
                          className="h-8 gap-1.5"
                        >
                          {replyLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          Regenerate
                        </Button>
                        <Button
                          size="sm"
                          variant="warning"
                          onClick={copyReply}
                          disabled={!email.aiReplyDraft.trim()}
                          className="h-8 gap-1.5"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-warning-200/70 bg-yellow-50/45 px-4 py-4 shadow-sm">
                      <p className="text-sm font-medium text-slate-700">No reply draft yet</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Generate a draft for a starting point, then edit it before using.
                      </p>
                      <Button
                        size="sm"
                        onClick={generateReply}
                        disabled={replyLoading}
                        variant="warning"
                        className="mt-3 h-8 gap-1.5"
                      >
                        {replyLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Wand2 className="h-3.5 w-3.5" />
                        )}
                        Generate reply
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* AI analysis */}
            {hasAiAnalysis && (
              <Card className="border-warning-100 bg-gradient-to-br from-yellow-50/55 to-white shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Sparkles className="h-4 w-4 text-warning" />
                      AI Analysis
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className="shrink-0 gap-1 border-warning-100 bg-white/70 text-[10px] text-warning-700"
                    >
                      {Math.round((email.classConfidence ?? 0) * 100)}% confidence
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-6 text-warning-700/85">{email.classReasoning}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* RIGHT */}
          <div className="space-y-4">
            {/* Linked tasks */}
            <Card className="border-white/70 bg-white/95 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <CheckSquare className="h-4 w-4 text-brand-600" />
                    Linked Tasks
                    <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">
                      {linkedTasks.length}
                    </span>
                  </CardTitle>
                  {canExtractTask && (
                    <Button
                      size="sm"
                      onClick={extractTask}
                      disabled={extractLoading}
                      className="h-8 gap-1.5 px-3"
                    >
                      {extractLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {linkedTasks.length > 0 ? 'Extract more' : 'Extract to Task'}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {extractLoading && (
                  <div className="flex items-center gap-2.5 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm text-brand-700">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-500" />
                    <span>Generating an AI suggestion — this may take a moment…</span>
                  </div>
                )}
                {linkedTasks.length > 0 ? (
                  linkedTasks.map((task) => {
                    const band = getPriorityBand(task.priorityScore)
                    const sts = TASK_STATUS_CONFIG[task.status]
                    const isDone = task.status === 'completed'
                    return (
                      <Link
                        key={task.id}
                        href={`/demo/tasks/${task.id}`}
                        className={cn(
                          'group flex items-center gap-3 rounded-lg border p-3 transition-all hover:shadow-sm',
                          isDone ? 'opacity-50 hover:opacity-70' : 'hover:border-brand-200 hover:bg-brand-50/50',
                        )}
                      >
                        <div
                          className={cn(
                            'h-8 w-1 shrink-0 rounded-full',
                            band === 'critical'
                              ? 'bg-critical'
                              : band === 'high'
                                ? 'bg-orange'
                                : band === 'medium'
                                  ? 'bg-yellow'
                                  : 'bg-gray-300',
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'truncate text-sm font-medium transition-colors',
                              isDone ? 'text-gray-400 line-through' : 'text-gray-900 group-hover:text-brand-600',
                            )}
                          >
                            {task.title}
                          </p>
                          <div className="mt-1 flex items-center gap-1.5">
                            <span
                              className={cn(
                                'rounded-full px-1.5 py-0.5 text-[9px] font-medium',
                                sts.chip,
                              )}
                            >
                              {sts.label}
                            </span>
                            <Badge variant="outline" className={cn('text-[9px]', getPriorityColor(band))}>
                              {getPriorityLabel(band)}
                            </Badge>
                          </div>
                        </div>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-brand-400" />
                      </Link>
                    )
                  })
                ) : !extractLoading ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-4">
                    <p className="text-sm font-medium text-slate-700">No linked tasks yet</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {canExtractTask
                        ? 'Click "Extract to Task" to let EmailFlow pull the action out of this thread.'
                        : 'No tasks needed for this email.'}
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {/* Classification picker */}
            <Card className="border-white/70 bg-white/95 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Tag className="h-4 w-4 text-brand-600" />
                  Classification
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className={cn('rounded-xl border px-3 py-3', detailTone)}>
                  <div className="flex items-center gap-2">
                    <ClsIcon className="h-4 w-4" />
                    <div>
                      <p className="text-sm font-semibold">{cfg.label}</p>
                      <p className="text-[11px] opacity-80">Current classification</p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500">Mark this email as</p>
                <select
                  value={pickerValue}
                  onChange={(e) => {
                    const v = e.target.value as EmailBucket | ''
                    if (v) setBucket(v)
                  }}
                  disabled={classifying}
                  className="h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm font-medium text-gray-800 shadow-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                >
                  {pickerValue === '' && (
                    <option value="" disabled>
                      Pick a category…
                    </option>
                  )}
                  {(Object.keys(EMAIL_BUCKET_CONFIG) as EmailBucket[]).map((bucket) => (
                    <option key={bucket} value={bucket}>
                      {EMAIL_BUCKET_CONFIG[bucket].label}
                    </option>
                  ))}
                </select>
              </CardContent>
            </Card>

            {/* Details */}
            <Card className="border-white/70 bg-white/95 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Shield className="h-4 w-4 text-gray-400" />
                  Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Classification</dt>
                    <dd className="font-medium text-gray-700">{cfg.label}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Received</dt>
                    <dd className="font-medium text-gray-700">
                      {new Date(email.receivedAt).toLocaleDateString()}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Recipient</dt>
                    <dd className="font-medium text-gray-700">{email.recipients}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Tasks linked</dt>
                    <dd className="font-medium text-gray-700">{linkedTasks.length}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

    </div>
  )
}
