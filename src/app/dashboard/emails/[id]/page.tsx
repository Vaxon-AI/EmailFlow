'use client'

import { useQuery } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageHeader } from '@/components/page-header'
import { StatePanel } from '@/components/state-panel'
import { ReassignProjectModal } from '@/components/reassign-project-modal'
import { UpgradeModal } from '@/components/upgrade-modal'
import { useAuth } from '@/lib/use-auth'
import {
  ArrowLeft, Mail, Paperclip, Clock, ArrowUpRight, ArrowDownLeft,
  CheckSquare, Sparkles, Shield, Plus, Tag, X,
  UserRound, ChevronRight, FolderOpen, Pencil, Loader2, Trash2,
  Copy, RefreshCw, Save, CheckCircle2, EyeOff,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getPriorityBand, getPriorityColor, getPriorityLabel, getTaskStatusLabel } from '@/types'
import {
  EMAIL_BUCKET_CONFIG,
  EMAIL_DISPLAY_CONFIG,
  EMAIL_DETAIL_TONE,
  EMAIL_DETAIL_HEADER_BG,
  getEmailDisplayState,
  type EmailBucket,
  type EmailDisplayState,
} from '@/lib/email-classification'
import { getEmailLinkedTaskState } from '@/lib/email-linked-task-status'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'
import { CACHE_TIME } from '@/lib/query-cache'
import { useReplyDraft } from './use-reply-draft'
import { useCreateTaskForm } from './use-create-task-form'

type EmailTaskLink = {
  id: string
  task: {
    id: string
    title: string
    summary?: string | null
    actionItems?: string | null
    checkedActionItems?: string | null
    status: string
    completedAt?: string | null
    archivedAt?: string | null
    priorityScore?: number | null
    startDate?: string | null
    explicitDeadline?: string | null
    inferredDeadline?: string | null
    userSetDeadline?: string | null
    userNotes?: string | null
  }
}

type ApiErrorPayload = {
  error?: { message?: string } | string
}

// Shared between real and demo email detail — see EMAIL_DETAIL_TONE /
// EMAIL_DETAIL_HEADER_BG in src/lib/email-classification.ts.
const DETAIL_CLASS_TONE = EMAIL_DETAIL_TONE
const DETAIL_HEADER_TONE = EMAIL_DETAIL_HEADER_BG

const DETAIL_SENDER_TONE: Record<EmailDisplayState, string> = {
  needs_action: 'border-critical-50 bg-white/85',
  tracked: 'border-brand-50 bg-white/85',
  fyi: 'border-gray-100 bg-white/85',
  ignored: 'border-gray-100 bg-white/85',
  uncertain: 'border-warning-50 bg-white/85',
  unclassified: 'border-warning-50 bg-white/85',
}

export default function EmailDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isPro = Boolean(user?.plan && user.plan !== 'free')
  const emailId = params.id as string
  const [classifying, setClassifying] = useState(false)
  const [unlinkingTaskId, setUnlinkingTaskId] = useState<string | null>(null)
  const [showReassign, setShowReassign] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [extracting, setExtracting] = useState(false)

  const goBack = useCallback(() => {
    if (window.history.length > 1) {
      router.back()
      return
    }
    router.push('/dashboard/emails')
  }, [router])

  const { data: res, isLoading } = useQuery({
    queryKey: ['email', emailId],
    queryFn: () => fetch(`/api/emails/${emailId}`).then((r) => r.json()),
    staleTime: CACHE_TIME.detail,
    placeholderData: (previous) => previous,
  })

  const email = res?.data
  const emailProjectName: string | undefined = email?.project?.name
  const emailIdentityName: string | undefined = email?.project?.identity?.name

  const {
    replyDraft,
    setReplyDraft,
    generatingReply,
    savingReply,
    generateReply,
    saveReply,
    copyReply,
  } = useReplyDraft(emailId, email?.aiReplyDraft, email?.id)

  const {
    showCreateModal,
    setShowCreateModal,
    taskTitle,
    setTaskTitle,
    taskSummary,
    setTaskSummary,
    linkedEmailIds,
    setLinkedEmailIds,
    creatingTask,
    draftDeadline,
    setDraftDeadline,
    draftStartDate,
    setDraftStartDate,
    suggestingDates,
    showUpgrade,
    setShowUpgrade,
    draftUrgency,
    setDraftUrgency,
    draftImpact,
    setDraftImpact,
    draftPriorityScore,
    setDraftPriorityScore,
    draftActionItems,
    setDraftActionItems,
    handleSuggestDates,
    handleCreateModalOpenChange,
    handleCreateTask,
  } = useCreateTaskForm({
    emailId,
    projectId: email?.project?.id,
    isPro,
  })

  async function readErrorMessage(response: Response, fallback: string) {
    try {
      const data = await response.json() as ApiErrorPayload
      if (typeof data.error === 'string') return data.error
      return data.error?.message || fallback
    } catch {
      return fallback
    }
  }

  async function handleRestore() {
    setRestoring(true)
    try {
      const r = await fetch(`/api/emails/${emailId}/restore`, { method: 'POST' })
      const json = await r.json()
      if (!r.ok) {
        showError(json?.error?.message || json?.error || 'Restore failed')
      } else {
        toast.success('Email body restored')
        queryClient.invalidateQueries({ queryKey: ['email', emailId] })
      }
    } catch {
      showError('Restore failed')
    } finally {
      setRestoring(false)
    }
  }

  const handleClassify = async (newBucket: EmailBucket) => {
    // newBucket is one of the 4 picker values; currentDisplay can also be
    // 'uncertain' which intentionally never matches, so an uncertain email
    // always commits on the first click.
    const currentDisplay = email
      ? getEmailDisplayState({ classification: email.classification, actioned: email.actioned, taskLinks: email.taskLinks })
      : null
    if (newBucket === currentDisplay) return
    setClassifying(true)
    try {
      const res = await fetch(`/api/emails/${emailId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket: newBucket }),
      })
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['email', emailId] })
        queryClient.invalidateQueries({ queryKey: ['emails'] })
        toast.success(`Marked as ${EMAIL_BUCKET_CONFIG[newBucket].label}`)
      } else {
        showError(await readErrorMessage(res, 'Failed to update classification'))
      }
    } catch {
      showError('Failed to update classification')
    } finally {
      setClassifying(false)
    }
  }

  const unlinkTask = async (taskId: string) => {
    setUnlinkingTaskId(taskId)
    try {
      const res = await fetch(`/api/emails/${emailId}/tasks/${taskId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['email', emailId] })
        toast.success('Task unlinked')
      } else {
        showError('Failed to unlink task')
      }
    } catch {
      showError('Failed to unlink task')
    } finally {
      setUnlinkingTaskId(null)
    }
  }

  const [ignoring, setIgnoring] = useState(false)
  const handleIgnore = async () => {
    if (ignoring) return
    setIgnoring(true)
    try {
      const res = await fetch('/api/emails/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [emailId], action: 'ignore' }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        showError(json?.error?.message || 'Failed to ignore email')
        return
      }
      toast.success('Email ignored')
      queryClient.invalidateQueries({ queryKey: ['email', emailId] })
      queryClient.invalidateQueries({ queryKey: ['emails'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      router.push('/dashboard/emails')
    } catch {
      showError('Failed to ignore email')
    } finally {
      setIgnoring(false)
    }
  }

  const handleExtractToTask = async () => {
    if (extracting) return
    if (email?.classification !== 'action' && email?.classification !== 'uncertain' && email?.classification) {
      showError('Only Needs Action or Unclassified emails can be extracted into tasks.')
      return
    }
    setExtracting(true)
    try {
      const res = await fetch(`/api/emails/${emailId}/extract-task`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        showError(json?.error?.message || 'Failed to extract task')
        return
      }
      const created = (json?.data?.created ?? 0) as number
      const deduped = (json?.data?.deduped ?? 0) as number
      const noCandidates = Boolean(json?.data?.noCandidates)

      if (created > 0 && deduped > 0) {
        toast.success(`Created ${created} new task${created > 1 ? 's' : ''}; ${deduped} already covered.`)
      } else if (created > 0) {
        toast.success(`Created ${created} task${created > 1 ? 's' : ''}.`)
      } else if (deduped > 0) {
        toast.info('This email is already covered by existing tasks.')
      } else if (noCandidates) {
        toast.info("AI didn't find any actionable items. Email left unchanged.")
      } else {
        toast.info('Nothing to do.')
      }

      queryClient.invalidateQueries({ queryKey: ['email', emailId] })
      queryClient.invalidateQueries({ queryKey: ['emails'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['pending-review-count'] })
    } catch {
      showError('Failed to extract task')
    } finally {
      setExtracting(false)
    }
  }

  if (isLoading) {
    return (
      <StatePanel
        loading
        title="Loading email"
        description="Pulling the latest message details, linked tasks, and AI analysis."
      />
    )
  }

  if (!email) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={goBack} className="w-fit gap-2 px-0 text-gray-500 hover:bg-transparent hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" />
          Back to inbox
        </Button>
        <PageHeader
          title="Email unavailable"
          description="We couldn't find this message in the current workspace."
        />
        <StatePanel
          icon={<Mail className="h-5 w-5 text-gray-400" />}
          title="Email not found"
          description="It may have been removed, or the current account no longer has access to it."
        />
      </div>
    )
  }

  const displayState = getEmailDisplayState({
    classification: email.classification,
    actioned: email.actioned,
    taskLinks: email.taskLinks,
  })
  const cls = EMAIL_DISPLAY_CONFIG[displayState]
  const ClsIcon = cls.icon
  const detailClassTone = DETAIL_CLASS_TONE[displayState]
  const detailHeaderTone = DETAIL_HEADER_TONE[displayState]
  const detailSenderTone = DETAIL_SENDER_TONE[displayState]
  // Picker can't represent 'uncertain' (it's an AI-only state); leave the
  // Select unselected so the user is nudged to commit a real bucket.
  const pickerValue: EmailBucket | undefined =
    displayState === 'unclassified' || displayState === 'uncertain' ? undefined : displayState
  const senderName = email.sender?.split('<')[0]?.trim()
  const senderEmail = email.sender?.match(/<(.+?)>/)?.[1] || email.sender
  const senderInitial = (senderName || 'U')[0].toUpperCase()
  // Gmail tags outgoing messages with the SENT label during sync; use it to
  // distinguish authored mail from received mail in the header.
  const isSent = (() => {
    try {
      const parsed = JSON.parse(email.labels || '[]')
      return Array.isArray(parsed) && parsed.includes('SENT')
    } catch {
      return false
    }
  })()
  const project = email.project ?? null
  const matter = email.matter ?? null
  const taskLinks = (email.taskLinks ?? []) as EmailTaskLink[]
  const linkedTaskState = getEmailLinkedTaskState(taskLinks)
  const isCompletedTrackedEmail = displayState === 'tracked' && linkedTaskState === 'completed'
  const canShowReplyDraft = email.classification === 'action' || email.classification === 'uncertain' || taskLinks.length > 0 || !!email.aiReplyDraft
  const canGenerateReply = email.retentionStatus !== 'PURGED'
  const canExtractTask = email.classification === 'action' || email.classification === 'uncertain' || !email.classification
  const hasLinkedTasks = taskLinks.length > 0
  const hasAiAnalysis = Boolean(
    email.classReasoning &&
    typeof email.classConfidence === 'number' &&
    !email.classReasoning.startsWith('Manually updated')
  )

  return (
    <div className="animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={goBack} className="w-fit gap-2 px-0 text-gray-500 hover:bg-transparent hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" />
          Back to inbox
        </Button>
        {/* Ignore = soft delete: collapses the email into the ignore bucket so
            it stops showing up in Needs Action / All. DB row stays so email
            sync dedup is unaffected. Hidden once already actioned to avoid a
            confusing no-op click. */}
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
      <div className="mx-auto max-w-6xl space-y-5">
        <PageHeader
          title={email.subject}
          description="Review the message, linked work, and AI classification in one place."
        meta={`From ${senderName || senderEmail} • ${new Date(email.receivedAt).toLocaleString('en', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}`}
      />

        <button
          onClick={() => email.threadId && setShowReassign(true)}
          disabled={!email.threadId}
          className="group animate-fade-in-up stagger-2 flex w-full items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-2.5 text-left transition-colors hover:border-brand-200 hover:bg-brand-50/50 disabled:cursor-default disabled:opacity-60"
          title={email.threadId ? 'Click to change project' : 'No thread ID — cannot reassign'}
        >
          <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="text-xs font-medium text-slate-500">{project?.identity?.name || 'Unassigned'}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="text-xs font-semibold text-slate-700">{project?.name || 'Uncategorized'}</span>
          {matter && (
            <>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
              <span className="text-xs text-slate-500">{matter.title}</span>
            </>
          )}
          {email.threadId && (
            <span className="ml-auto flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-500 shadow-sm group-hover:border-brand-300 group-hover:text-brand-600">
              <Pencil className="h-3 w-3" />
              Change
            </span>
          )}
        </button>

        {email.threadId && (
          <ReassignProjectModal
            open={showReassign}
            onOpenChange={setShowReassign}
            threadId={email.threadId}
            currentProject={project}
            invalidateKeys={[['email', email.id]]}
          />
        )}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        {/* Left: Email content */}
        <div className="space-y-4">
          {/* Header card */}
          <Card className={`animate-fade-in-up stagger-3 overflow-hidden border-white/70 bg-gradient-to-br ${
            isCompletedTrackedEmail ? 'from-slate-50/45 via-white to-white' : detailHeaderTone
          } shadow-sm`}>
            <CardContent className="py-5 space-y-4">
              {/* Meta badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={`gap-1 ${detailClassTone}`}>
                  <ClsIcon className="h-3 w-3" />
                  {cls.label}
                </Badge>
                {isCompletedTrackedEmail && <CompleteBadge />}
                {email.hasAttachments && (
                  <Badge variant="outline" className="gap-1 bg-white/60 text-gray-500 border-gray-200 text-[10px]">
                    <Paperclip className="h-3 w-3" />
                    Attachments
                  </Badge>
                )}
              </div>

              {/* Sender row */}
              <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 backdrop-blur-sm ${
                isCompletedTrackedEmail ? 'border-slate-100 bg-white/90' : detailSenderTone
              }`}>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  isCompletedTrackedEmail ? 'bg-slate-200 text-slate-600' : 'bg-brand-600 text-white'
                }`}>
                  {senderInitial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{senderName}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xs text-gray-500">{senderEmail}</p>
                    {isSent ? (
                      <Badge variant="outline" className="gap-1 bg-brand-50/70 text-brand-600 border-brand-200 text-[10px]">
                        <ArrowUpRight className="h-3 w-3" />
                        Sent
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 bg-white/60 text-gray-500 border-gray-200 text-[10px]">
                        <ArrowDownLeft className="h-3 w-3" />
                        Received
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="h-3 w-3" />
                    {new Date(email.receivedAt).toLocaleString('en', {
                      weekday: 'short', month: 'short', day: 'numeric',
                      hour: 'numeric', minute: '2-digit',
                    })}
                  </div>
                  {email.accountEmail && (
                    <p className="text-[10px] text-gray-400 mt-0.5">To: {email.accountEmail}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Retention restore banner — only shown for METADATA_ONLY emails */}
          {email.retentionStatus === 'METADATA_ONLY' && (
            <div className="flex items-start gap-3 rounded-xl border border-warning-200 bg-warning-100/70 px-4 py-3 text-sm">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="flex-1 space-y-1">
                <p className="font-medium text-warning-700">Email body has been removed</p>
                <p className="text-xs text-warning-700">
                  {email.restorableUntil
                    ? `Restorable until ${new Date(email.restorableUntil).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}.`
                    : 'Restore window may be limited.'}
                  {' '}Re-fetches the original content from your email provider.
                </p>
              </div>
              <Button
                size="sm"
                variant="warning"
                className="shrink-0 gap-1.5"
                onClick={handleRestore}
                disabled={restoring}
              >
                {restoring && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Restore body
              </Button>
            </div>
          )}

          {/* PURGED placeholder */}
          {email.retentionStatus === 'PURGED' && (
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm text-gray-500">
              <Trash2 className="h-4 w-4 shrink-0 text-gray-400" />
              <p>This email has been purged. The body and preview are no longer available.</p>
            </div>
          )}

          {/* Email body */}
          <Card className="animate-fade-in-up stagger-3 border-white/70 bg-white/95 shadow-sm">
            <CardContent className="py-5">
              {email.bodyHtml ? (
                <div
                  className="prose prose-sm max-w-none text-gray-700 leading-relaxed prose-a:text-brand-600 prose-a:no-underline hover:prose-a:underline prose-img:rounded-lg prose-img:my-2"
                  dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
                />
              ) : (
                <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {email.bodyFull || email.bodyPreview || (
                    <span className="italic text-gray-400">No body content available.</span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Reply draft */}
          {canShowReplyDraft && (
            <Card className="animate-fade-in-up stagger-5 border-warning-100/50 bg-gradient-to-br from-yellow-50/35 via-white to-white shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Sparkles className="h-4 w-4 text-warning/75" />
                    AI Reply Draft
                  </CardTitle>
                  {email.aiReplyGeneratedAt && (
                    <span className="text-[10px] font-medium text-slate-400">
                      Generated {new Date(email.aiReplyGeneratedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs leading-5 text-slate-500">
                  Drafts use this email plus linked task status, checklist progress, deadlines, and notes. Nothing is sent automatically.
                </p>
                {replyDraft ? (
                  <>
                    <Textarea
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      rows={8}
                      className="resize-y border-warning-200/70 bg-white text-sm leading-6 shadow-sm focus-visible:border-warning-200 focus-visible:ring-warning/20"
                      placeholder="AI reply draft will appear here..."
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={saveReply}
                        disabled={savingReply || !replyDraft.trim()}
                        className="h-8 gap-1.5 bg-brand-600 hover:bg-brand-700"
                      >
                        {savingReply ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="warning"
                        onClick={() => generateReply()}
                        disabled={generatingReply || !canGenerateReply}
                        className="h-8 gap-1.5"
                      >
                        {generatingReply ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Regenerate
                      </Button>
                      <Button
                        size="sm"
                        variant="warning"
                        onClick={copyReply}
                        disabled={!replyDraft.trim()}
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
                      Generate a draft when you want a starting point, then edit it before using it.
                    </p>
                    <Button
                      size="sm"
                      onClick={() => generateReply()}
                      disabled={generatingReply || !canGenerateReply}
                      variant="warning"
                      className="mt-3 h-8 gap-1.5"
                    >
                      {generatingReply ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Generate reply
                    </Button>
                    {!canGenerateReply && (
                      <p className="mt-2 text-[11px] text-slate-400">This email no longer has enough content to generate a draft.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {hasAiAnalysis && (
            <Card className="animate-fade-in-up stagger-6 border-warning-100 bg-gradient-to-br from-yellow-50/55 to-white shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Sparkles className="h-4 w-4 text-warning" />
                    AI Analysis
                  </CardTitle>
                  <Badge variant="outline" className="shrink-0 gap-1 bg-white/70 text-warning-700 border-warning-100 text-[10px]">
                    {Math.round(email.classConfidence * 100)}% confidence
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-warning-700/85">{email.classReasoning}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Linked Tasks */}
          <Card className={`animate-fade-in-up stagger-5 border-white/70 shadow-sm ${
            isCompletedTrackedEmail ? 'bg-slate-50/55' : 'bg-white/95'
          }`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <CheckSquare className="h-4 w-4 text-brand-600" />
                    Linked Tasks
                    <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">{taskLinks.length}</span>
                    {isCompletedTrackedEmail && <CompleteBadge />}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {canExtractTask && (
                      <Button
                        size="sm"
                        onClick={handleExtractToTask}
                        disabled={extracting}
                        className="h-8 gap-1.5 px-3"
                      >
                        {extracting
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Sparkles className="h-3.5 w-3.5" />}
                        {hasLinkedTasks ? 'Extract more tasks' : 'Extract to Task'}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowCreateModal(true)}
                      className="h-8 gap-1.5 px-3"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Create
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {extracting && (
                  <div className="flex items-center gap-2.5 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm text-brand-700">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-500" />
                    <span>Generating an AI suggestion - this may take a moment...</span>
                  </div>
                )}
                {taskLinks.length ? (
                  taskLinks.map((link) => {
                  const band = getPriorityBand(link.task.priorityScore || 0)
                  const isDone = link.task.status === 'completed'
                  const isArchived = !!link.task.archivedAt
                  const isUnlinking = unlinkingTaskId === link.task.id
                  return (
                    <div
                      key={link.id}
                      className={`flex items-center gap-3 rounded-lg border p-3 transition-all hover:shadow-sm group ${
                        isDone ? 'opacity-50 hover:opacity-70' : 'hover:bg-brand-50/50 hover:border-brand-200'
                      }`}
                    >
                      <Link
                        href={`/dashboard/tasks/${link.task.id}`}
                        className="flex items-center gap-3 flex-1 min-w-0"
                      >
                        <div className={`h-8 w-1 shrink-0 rounded-full ${
                          band === 'critical' ? 'bg-critical' :
                          band === 'high'     ? 'bg-orange' :
                          band === 'medium'   ? 'bg-yellow' :
                                                'bg-gray-300'
                        }`} />
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm font-medium transition-colors ${isDone ? 'text-gray-400 line-through' : 'text-gray-900 group-hover:text-brand-600'}`}>
                            {link.task.title}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                              link.task.status === 'completed' ? 'bg-success-100 text-success' :
                              link.task.status === 'active' ? 'bg-brand-100 text-brand-700' :
                              'bg-ai-100 text-ai-700'
                            }`}>
                              {getTaskStatusLabel(link.task.status)}
                            </span>
                            {isArchived && (
                              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-500" title="This task was auto-archived. It remains accessible until the source emails are also removed.">
                                Archived
                              </span>
                            )}
                            <Badge variant="outline" className={`text-[9px] ${getPriorityColor(band)}`}>
                              {getPriorityLabel(band)}
                            </Badge>
                          </div>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-gray-300 group-hover:text-brand-400 shrink-0 transition-colors" />
                      </Link>
                      <button
                        onClick={() => {
                          if (confirm('Remove this task from the email?')) {
                            unlinkTask(link.task.id)
                          }
                        }}
                        disabled={isUnlinking}
                        className="shrink-0 p-1 rounded hover:bg-critical-50 transition-colors text-gray-300 hover:text-critical disabled:opacity-50"
                        title="Remove task"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )
                  })
                ) : !extracting && (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-4">
                    <p className="text-sm font-medium text-slate-700">No linked tasks yet</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {email.classification === 'action'
                        ? 'Click "Extract to Task" to let AI extract and create a task from this email.'
                        : email.classification === 'uncertain'
                          ? 'Use "Extract to Task" if this needs follow-up, or create a task manually to link it yourself.'
                        : 'Create a task here to keep this email connected to work that follows from it.'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

          {/* Reclassify */}
          <Card className="animate-fade-in-up stagger-6 border-white/70 bg-white/95 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Tag className="h-4 w-4 text-brand-600" />
                Classification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className={`rounded-xl border px-3 py-3 ${detailClassTone}`}>
                <div className="flex items-center gap-2">
                  <ClsIcon className="h-4 w-4" />
                  <div>
                    <p className="text-sm font-semibold">{cls.label}</p>
                    <p className="text-[11px] opacity-80">Current classification</p>
                  </div>
                </div>
              </div>
              <Label className="text-xs text-gray-500">Mark this email as</Label>
              <Select
                value={pickerValue}
                onValueChange={(value) => { if (value) handleClassify(value as EmailBucket) }}
                disabled={classifying}
              >
                <SelectTrigger className="h-10 w-full border-gray-200 bg-white text-sm shadow-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    {classifying ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-500" />
                    ) : (
                      <ClsIcon className="h-4 w-4 shrink-0 text-brand-500" />
                    )}
                    <span className="truncate font-medium text-gray-800">{cls.label}</span>
                  </div>
                </SelectTrigger>
                <SelectContent align="start">
                  {(Object.entries(EMAIL_BUCKET_CONFIG) as [EmailBucket, typeof EMAIL_BUCKET_CONFIG[EmailBucket]][]).map(([key, config]) => {
                    const Icon = config.icon
                    return (
                      <SelectItem key={key} value={key}>
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span>{config.label}</span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Email metadata */}
          <Card className="animate-fade-in-up stagger-7 border-white/70 bg-white/95 shadow-sm">
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
                  <dd className="font-medium text-gray-700">{cls.label}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-400">Received</dt>
                  <dd className="font-medium text-gray-700">{new Date(email.receivedAt).toLocaleDateString('en-US')}</dd>
                </div>
                {email.accountEmail && (
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Account</dt>
                    <dd className="font-medium text-gray-700">{email.accountEmail}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-gray-400">Tasks linked</dt>
                  <dd className="font-medium text-gray-700">{taskLinks.length}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
        </div>
      </div>

      <UpgradeModal open={showUpgrade} onOpenChange={setShowUpgrade} />

      {/* Create Task Modal */}
      <Dialog open={showCreateModal} onOpenChange={handleCreateModalOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Task from Email</DialogTitle>
            <DialogDescription>
              Start a task from this message and keep the link back to the source email.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email-task-title">Task Title</Label>
              <Input
                id="email-task-title"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Enter task title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-task-summary">Summary <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="email-task-summary"
                value={taskSummary}
                onChange={(e) => setTaskSummary(e.target.value)}
                placeholder="Add a short task summary"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Linked Emails</Label>
              <div className="rounded-xl border border-brand-100 bg-brand-50/70 p-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded border border-brand-200 bg-white">
                    <CheckSquare className="h-3.5 w-3.5 text-brand-600" />
                  </div>
                  <span className="flex-1 truncate text-sm text-gray-700">{email.subject}</span>
                  <span className="text-xs font-medium text-brand-600">Current email</span>
                </div>
              </div>
            </div>

            {/* Identity / Project — inherited from this email's classification (read-only) */}
            <div className="space-y-2">
              <Label>Filed under</Label>
              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Identity</div>
                  <div className="flex items-center gap-1.5 text-sm">
                    <UserRound className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className={`truncate ${emailIdentityName ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {emailIdentityName ?? '—'}
                    </span>
                  </div>
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Project</div>
                  <div className="flex items-center gap-1.5 text-sm">
                    <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className={`truncate ${emailProjectName ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {emailProjectName ?? 'Uncategorized'}
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-[11px] italic text-muted-foreground">
                The new task will inherit these from the email. To change them, reassign the email first.
              </p>
            </div>

            {/* Checklist */}
            <div className="space-y-2">
              <Label>Checklist <span className="text-muted-foreground font-normal">(optional)</span></Label>
              {draftActionItems.length > 0 && (
                <div className="space-y-1.5">
                  {draftActionItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={item}
                        onChange={(e) => {
                          const next = [...draftActionItems]
                          next[i] = e.target.value
                          setDraftActionItems(next)
                        }}
                        className="h-8 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setDraftActionItems(draftActionItems.filter((_, j) => j !== i))}
                        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setDraftActionItems([...draftActionItems, ''])}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="size-3.5" /> Add item
              </button>
            </div>

            {/* Dates */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Dates <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleSuggestDates}
                  disabled={!taskTitle.trim() || suggestingDates}
                  className="h-7 gap-1 text-xs"
                >
                  <Sparkles className="size-3" />
                  {suggestingDates ? 'Suggesting...' : 'Suggest dates'}
                  {!isPro && (
                    <Badge className="ml-1 h-4 bg-brand-100 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700 hover:bg-brand-100">
                      Pro
                    </Badge>
                  )}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="email-task-start-date" className="text-xs text-muted-foreground">Start date</Label>
                  <Input
                    id="email-task-start-date"
                    type="date"
                    value={draftStartDate}
                    onChange={(e) => setDraftStartDate(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="email-task-deadline" className="text-xs text-muted-foreground">Due date</Label>
                  <Input
                    id="email-task-deadline"
                    type="date"
                    value={draftDeadline}
                    onChange={(e) => setDraftDeadline(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Priority */}
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={(() => {
                  if (draftPriorityScore >= 20) return 'critical'
                  if (draftPriorityScore >= 12) return 'high'
                  if (draftPriorityScore >= 6) return 'medium'
                  return 'low'
                })()}
                onValueChange={(v) => {
                  if (!v) return
                  const map: Record<string, { urgency: number; impact: number; score: number }> = {
                    critical: { urgency: 5, impact: 4, score: 20 },
                    high: { urgency: 4, impact: 4, score: 16 },
                    medium: { urgency: 3, impact: 3, score: 9 },
                    low: { urgency: 2, impact: 2, score: 4 },
                  }
                  const p = map[v]
                  if (p) { setDraftUrgency(p.urgency); setDraftImpact(p.impact); setDraftPriorityScore(p.score) }
                }}
              >
                <SelectTrigger className="h-8 w-full text-sm">
                  <SelectValue>
                    {draftPriorityScore >= 20 ? 'Critical'
                      : draftPriorityScore >= 12 ? 'High'
                      : draftPriorityScore >= 6 ? 'Medium'
                      : 'Low'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTask} disabled={creatingTask || !taskTitle.trim()}>
              {creatingTask ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CompleteBadge() {
  return (
    <Badge variant="outline" className="shrink-0 gap-1 border-success-100 bg-success-50/70 py-0 text-[10px] text-success">
      <CheckCircle2 className="h-3 w-3" />
      Complete
    </Badge>
  )
}
