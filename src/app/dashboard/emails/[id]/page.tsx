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
  Select, SelectContent, SelectItem, SelectTrigger,
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
import {
  ArrowLeft, Mail, Paperclip, Clock, ArrowUpRight,
  CheckSquare, Sparkles, Shield, Plus, Tag, X,
  UserRound, ChevronRight, FolderOpen, Pencil, Loader2, Trash2,
  Copy, RefreshCw, Save,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getPriorityBand, getPriorityColor, getPriorityLabel, getTaskStatusLabel } from '@/types'
import { EMAIL_CLASS_CONFIG, getEmailClassConfig } from '@/lib/email-classification'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'
import { CACHE_TIME } from '@/lib/query-cache'

type EmailTaskLink = {
  id: string
  task: {
    id: string
    title: string
    summary?: string | null
    actionItems?: string | null
    checkedActionItems?: string | null
    status: string
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

export default function EmailDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const emailId = params.id as string
  const [classifying, setClassifying] = useState(false)
  const [unlinkingTaskId, setUnlinkingTaskId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showReassign, setShowReassign] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskSummary, setTaskSummary] = useState('')
  const [linkedEmailIds, setLinkedEmailIds] = useState<string[]>([])
  const [creatingTask, setCreatingTask] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [replyDraft, setReplyDraft] = useState('')
  const [generatingReply, setGeneratingReply] = useState(false)
  const [savingReply, setSavingReply] = useState(false)

  const { data: res, isLoading } = useQuery({
    queryKey: ['email', emailId],
    queryFn: () => fetch(`/api/emails/${emailId}`).then((r) => r.json()),
    staleTime: CACHE_TIME.detail,
    placeholderData: (previous) => previous,
  })

  const email = res?.data

  useEffect(() => {
    setReplyDraft(email?.aiReplyDraft ?? '')
  }, [email?.id, email?.aiReplyDraft])

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

  const handleClassify = async (newClass: string) => {
    if (newClass === email?.classification) return
    setClassifying(true)
    try {
      const res = await fetch(`/api/emails/${emailId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classification: newClass }),
      })
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['email', emailId] })
        queryClient.invalidateQueries({ queryKey: ['emails'] })
        toast.success(`Marked as ${getEmailClassConfig(newClass).label}`)
      } else {
        showError(await readErrorMessage(res, 'Failed to update classification'))
      }
    } catch {
      showError('Failed to update classification')
    } finally {
      setClassifying(false)
    }
  }

  const generateReply = async (force = false) => {
    if (replyDraft.trim() && !force) {
      const shouldReplace = confirm('Regenerate the AI reply draft? This will replace the current draft.')
      if (!shouldReplace) return
    }

    setGeneratingReply(true)
    try {
      const res = await fetch(`/api/emails/${emailId}/reply-suggestion`, { method: 'POST' })
      if (!res.ok) {
        showError(await readErrorMessage(res, 'Failed to generate reply draft'))
        return
      }
      const data = await res.json()
      const nextReply = data?.data?.reply ?? ''
      setReplyDraft(nextReply)
      queryClient.invalidateQueries({ queryKey: ['email', emailId] })
      toast.success('Reply draft generated')
    } catch {
      showError('Failed to generate reply draft')
    } finally {
      setGeneratingReply(false)
    }
  }

  const saveReply = async () => {
    setSavingReply(true)
    try {
      const res = await fetch(`/api/emails/${emailId}/reply-suggestion`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply: replyDraft }),
      })
      if (!res.ok) {
        showError(await readErrorMessage(res, 'Failed to save reply draft'))
        return
      }
      queryClient.invalidateQueries({ queryKey: ['email', emailId] })
      toast.success('Reply draft saved')
    } catch {
      showError('Failed to save reply draft')
    } finally {
      setSavingReply(false)
    }
  }

  const copyReply = async () => {
    try {
      await navigator.clipboard.writeText(replyDraft)
      toast.success('Reply draft copied')
    } catch {
      showError('Failed to copy reply draft')
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

  const handleCreateTask = async () => {
    setCreatingTask(true)
    try {
      const res = await fetch('/api/emails/create-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskTitle,
          summary: taskSummary,
          sourceEmailId: emailId,
          linkedEmailIds: linkedEmailIds.length > 0 ? linkedEmailIds : [emailId],
        }),
      })

      if (res.ok) {
        await res.json()
        queryClient.invalidateQueries({ queryKey: ['email', emailId] })
        queryClient.invalidateQueries({ queryKey: ['tasks'] })
        toast.success('Task created')
        setShowCreateModal(false)
        setTaskTitle('')
        setTaskSummary('')
        setLinkedEmailIds([])
      } else {
        showError('Failed to create task')
      }
    } catch {
      showError('Failed to create task')
    } finally {
      setCreatingTask(false)
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
        <Button variant="ghost" onClick={() => router.push('/dashboard/emails')} className="w-fit gap-2 px-0 text-gray-500 hover:bg-transparent hover:text-gray-900">
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

  const cls = getEmailClassConfig(email.classification)
  const ClsIcon = cls.icon
  const senderName = email.sender?.split('<')[0]?.trim()
  const senderEmail = email.sender?.match(/<(.+?)>/)?.[1] || email.sender
  const senderInitial = (senderName || 'U')[0].toUpperCase()
  const project = email.project ?? null
  const matter = email.matter ?? null
  const taskLinks = (email.taskLinks ?? []) as EmailTaskLink[]
  const canShowReplyDraft = email.classification === 'action' || taskLinks.length > 0 || !!email.aiReplyDraft
  const canGenerateReply = email.retentionStatus !== 'PURGED'

  return (
    <div className="animate-in fade-in duration-200">
      <Button variant="ghost" onClick={() => router.push('/dashboard/emails')} className="w-fit gap-2 px-0 text-gray-500 hover:bg-transparent hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" />
        Back to inbox
      </Button>
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
          className="group animate-fade-in-up stagger-2 flex w-full items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-2.5 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/50 disabled:cursor-default disabled:opacity-60"
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
            <span className="ml-auto flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-500 shadow-sm group-hover:border-blue-300 group-hover:text-blue-600">
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
          <Card className={`animate-fade-in-up stagger-3 overflow-hidden border-white/70 bg-gradient-to-br ${cls.bg} shadow-sm`}>
            <CardContent className="py-5 space-y-4">
              {/* Meta badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={`gap-1 ${cls.color}`}>
                  <ClsIcon className="h-3 w-3" />
                  {cls.label}
                </Badge>
                {email.classConfidence && (
                  <Badge variant="outline" className="gap-1 bg-white/60 text-gray-500 border-gray-200 text-[10px]">
                    <Sparkles className="h-3 w-3" />
                    {Math.round(email.classConfidence * 100)}% confidence
                  </Badge>
                )}
                {email.hasAttachments && (
                  <Badge variant="outline" className="gap-1 bg-white/60 text-gray-500 border-gray-200 text-[10px]">
                    <Paperclip className="h-3 w-3" />
                    Attachments
                  </Badge>
                )}
              </div>

              {/* Sender row */}
              <div className="flex items-center gap-3 rounded-xl bg-white/70 backdrop-blur-sm border px-4 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-sm font-bold">
                  {senderInitial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{senderName}</p>
                  <p className="text-xs text-gray-500">{senderEmail}</p>
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
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="flex-1 space-y-1">
                <p className="font-medium text-amber-900">Email body has been removed</p>
                <p className="text-xs text-amber-700">
                  {email.restorableUntil
                    ? `Restorable until ${new Date(email.restorableUntil).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}.`
                    : 'Restore window may be limited.'}
                  {' '}Re-fetches the original content from Gmail.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5 border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
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
              <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {email.bodyFull || email.bodyPreview || (
                  <span className="italic text-gray-400">No body content available.</span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Reply draft */}
          {canShowReplyDraft && (
            <Card className="animate-fade-in-up stagger-5 border-white/70 bg-white/95 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Sparkles className="h-4 w-4 text-amber-600" />
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
                      className="resize-y bg-white text-sm leading-6"
                      placeholder="AI reply draft will appear here..."
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={saveReply}
                        disabled={savingReply || !replyDraft.trim()}
                        className="h-8 gap-1.5 bg-blue-600 hover:bg-blue-700"
                      >
                        {savingReply ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => generateReply()}
                        disabled={generatingReply || !canGenerateReply}
                        className="h-8 gap-1.5"
                      >
                        {generatingReply ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Regenerate
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
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
                  <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/60 px-4 py-4">
                    <p className="text-sm font-medium text-amber-950">No reply draft yet</p>
                    <p className="mt-1 text-xs leading-5 text-amber-800/80">
                      Generate a draft when you want a starting point, then edit it before using it.
                    </p>
                    <Button
                      size="sm"
                      onClick={() => generateReply()}
                      disabled={generatingReply || !canGenerateReply}
                      className="mt-3 h-8 gap-1.5 bg-amber-600 text-white hover:bg-amber-700"
                    >
                      {generatingReply ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Generate reply
                    </Button>
                    {!canGenerateReply && (
                      <p className="mt-2 text-[11px] text-amber-800/70">This email no longer has enough content to generate a draft.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {email.classReasoning && (
            <Card className="animate-fade-in-up stagger-6 border-yellow-200 bg-gradient-to-br from-yellow-50/55 to-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-yellow-600" />
                  AI Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-yellow-900/85">{email.classReasoning}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Linked Tasks */}
          <Card className="animate-fade-in-up stagger-5 border-white/70 bg-white/95 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <CheckSquare className="h-4 w-4 text-blue-600" />
                    Linked Tasks
                    <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">{taskLinks.length}</span>
                  </CardTitle>
                  <Button
                    size="sm"
                    onClick={() => setShowCreateModal(true)}
                    className="h-8 gap-1.5 bg-blue-600 px-3 hover:bg-blue-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {taskLinks.length ? (
                  taskLinks.map((link) => {
                  const band = getPriorityBand(link.task.priorityScore || 0)
                  const isDone = link.task.status === 'completed' || link.task.status === 'dismissed'
                  const isUnlinking = unlinkingTaskId === link.task.id
                  return (
                    <div
                      key={link.id}
                      className={`flex items-center gap-3 rounded-lg border p-3 transition-all hover:shadow-sm group ${
                        isDone ? 'opacity-50 hover:opacity-70' : 'hover:bg-blue-50/50 hover:border-blue-200'
                      }`}
                    >
                      <Link
                        href={`/dashboard/tasks/${link.task.id}`}
                        className="flex items-center gap-3 flex-1 min-w-0"
                      >
                        <div className={`h-8 w-1 shrink-0 rounded-full ${
                          band === 'critical' ? 'bg-red-500' : band === 'high' ? 'bg-orange-400' : band === 'medium' ? 'bg-yellow-400' : 'bg-gray-300'
                        }`} />
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm font-medium transition-colors ${isDone ? 'text-gray-400 line-through' : 'text-gray-900 group-hover:text-blue-600'}`}>
                            {link.task.title}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                              link.task.status === 'completed' ? 'bg-green-100 text-green-700' :
                              link.task.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                              link.task.status === 'dismissed' ? 'bg-gray-100 text-gray-500' :
                              'bg-purple-100 text-purple-700'
                            }`}>
                              {getTaskStatusLabel(link.task.status)}
                            </span>
                            <Badge variant="outline" className={`text-[9px] ${getPriorityColor(band)}`}>
                              {getPriorityLabel(band)}
                            </Badge>
                          </div>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-gray-300 group-hover:text-blue-400 shrink-0 transition-colors" />
                      </Link>
                      <button
                        onClick={() => {
                          if (confirm('Remove this task from the email?')) {
                            unlinkTask(link.task.id)
                          }
                        }}
                        disabled={isUnlinking}
                        className="shrink-0 p-1 rounded hover:bg-red-50 transition-colors text-gray-300 hover:text-red-500 disabled:opacity-50"
                        title="Remove task"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-4">
                    <p className="text-sm font-medium text-slate-700">No linked tasks yet</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Create a task here to keep this email connected to work that follows from it.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

          {/* Reclassify */}
          <Card className="animate-fade-in-up stagger-6 border-white/70 bg-white/95 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Tag className="h-4 w-4 text-blue-600" />
                Classification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className={`rounded-xl border px-3 py-3 ${cls.color}`}>
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
                value={email.classification ?? 'uncertain'}
                onValueChange={(value) => { if (value) handleClassify(value) }}
                disabled={classifying}
              >
                <SelectTrigger className="h-10 w-full border-gray-200 bg-white text-sm shadow-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    {classifying ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
                    ) : (
                      <ClsIcon className="h-4 w-4 shrink-0 text-blue-500" />
                    )}
                    <span className="truncate font-medium text-gray-800">{cls.label}</span>
                  </div>
                </SelectTrigger>
                <SelectContent align="start">
                  {Object.entries(EMAIL_CLASS_CONFIG).map(([key, config]) => {
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
                {email.classConfidence && (
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Confidence</dt>
                    <dd className="font-medium text-gray-700">{Math.round(email.classConfidence * 100)}%</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-gray-400">Received</dt>
                  <dd className="font-medium text-gray-700">{new Date(email.receivedAt).toLocaleDateString()}</dd>
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

      {/* Create Task Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Create Task from Email</DialogTitle>
            <DialogDescription>
              Start a task from this message and keep the link back to the source email.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-5">
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
              <Label htmlFor="email-task-summary">Summary</Label>
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
              <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded border border-blue-200 bg-white">
                    <CheckSquare className="h-3.5 w-3.5 text-blue-600" />
                  </div>
                  <span className="flex-1 truncate text-sm text-gray-700">{email.subject}</span>
                  <span className="text-xs font-medium text-blue-600">Current email</span>
                </div>
              </div>
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
