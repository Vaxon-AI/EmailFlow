'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { InlineNotice } from '@/components/inline-notice'
import { PageHeader } from '@/components/page-header'
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { mutateJson } from '@/lib/api-client'
import { showError } from '@/components/error-dialog'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { requestStepUp, verifyStepUp } from '@/lib/step-up-client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RetentionPreview = {
  willArchive: number
  willBeMetadataOnly: number
  willPurge: number
  attachmentsAffected: number
  estimatedBytesFreed: number
  protected: number
  alreadyProcessed: number
}

type JobLog = {
  id: string
  triggeredBy: string
  startedAt: string
  completedAt: string | null
  emailsArchived: number
  emailsMetaOnly: number
  emailsPurged: number
  attachmentsPurged: number
  bytesFreed: string   // serialised as string (BigInt)
  errorCount: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CleanupPage() {
  const queryClient = useQueryClient()
  const [stepUpOpen, setStepUpOpen] = useState(false)
  const [stepUpMethod, setStepUpMethod] = useState<'totp' | 'email'>('email')
  const [stepUpCode, setStepUpCode] = useState('')
  const [stepUpError, setStepUpError] = useState('')
  const [stepUpLoading, setStepUpLoading] = useState(false)

  // ---- Queries ----

  const {
    data: previewRes,
    isLoading: previewLoading,
    refetch: refetchPreview,
  } = useQuery({
    queryKey: ['cleanup-preview'],
    queryFn: () => fetch('/api/cleanup/preview').then((r) => r.json()),
    staleTime: 30_000,
  })

  const { data: logsRes, isLoading: logsLoading } = useQuery({
    queryKey: ['cleanup-logs'],
    queryFn: () => fetch('/api/cleanup/logs?limit=10').then((r) => r.json()),
    staleTime: 30_000,
  })

  const preview: RetentionPreview | null = previewRes?.data ?? null
  const logs: JobLog[] = logsRes?.data ?? []

  // ---- Run cleanup mutation ----

  const runMutation = useMutation({
    mutationFn: async (stepUpToken: string) => {
      const json = await mutateJson<{
        data: { emailsArchived: number; emailsMetaOnly: number; emailsPurged: number }
      }>('/api/cleanup/run', {
        body: { stepUpToken },
        fallbackMessage: 'Cleanup failed',
      })
      return json.data
    },
    onSuccess: (result) => {
      toast.success(
        `Cleanup complete — ${result.emailsArchived} archived, ${result.emailsMetaOnly} body-only, ${result.emailsPurged} purged`
      )
      queryClient.invalidateQueries({ queryKey: ['cleanup-preview'] })
      queryClient.invalidateQueries({ queryKey: ['cleanup-logs'] })
    },
    onError: (err: Error) => showError(err.message),
  })

  // ---- Step-up flow ----

  async function handleRunClick() {
    setStepUpError('')
    setStepUpLoading(true)
    try {
      const { method } = await requestStepUp('run_cleanup')
      setStepUpMethod(method)
      setStepUpCode('')
      setStepUpOpen(true)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to start verification')
    } finally {
      setStepUpLoading(false)
    }
  }

  async function handleStepUpSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStepUpError('')
    setStepUpLoading(true)
    try {
      const token = await verifyStepUp('run_cleanup', stepUpCode.trim())
      setStepUpOpen(false)
      setStepUpCode('')
      runMutation.mutate(token)
    } catch (err) {
      setStepUpError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setStepUpLoading(false)
    }
  }

  // ---- Render ----

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/settings">
          <Button variant="ghost" size="sm" className="gap-1.5 px-0 text-gray-500 hover:bg-transparent hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            Settings
          </Button>
        </Link>
      </div>

      <PageHeader
        title="Email Cleanup"
        description="Preview what will be cleaned up and run the retention pass manually."
      />

      {/* ---- Preview card ---- */}
      <Card className="border-white/80 bg-white/95 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-brand-700" />
              What will happen next run
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchPreview()}
              disabled={previewLoading}
              className="gap-1.5 text-gray-500"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${previewLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {previewLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Computing preview…
            </div>
          ) : preview ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatTile
                  icon={<Archive className="h-4 w-4 text-gray-500" />}
                  label="Will archive"
                  value={preview.willArchive}
                  color="text-gray-700"
                />
                <StatTile
                  icon={<FileText className="h-4 w-4 text-warning" />}
                  label="Body-only"
                  value={preview.willBeMetadataOnly}
                  color="text-warning-700"
                />
                <StatTile
                  icon={<Trash2 className="h-4 w-4 text-critical" />}
                  label="Will purge"
                  value={preview.willPurge}
                  color="text-critical"
                />
              </div>

              {preview.attachmentsAffected > 0 && (
                <div className="rounded-xl border border-gray-200/80 bg-gray-50/60 px-4 py-3 text-sm">
                  <span className="font-medium text-gray-900">
                    {preview.attachmentsAffected} attachment record{preview.attachmentsAffected === 1 ? '' : 's'}
                  </span>
                  {preview.estimatedBytesFreed > 0 && (
                    <span className="ml-1 text-gray-500">
                      may clear ~{formatBytes(preview.estimatedBytesFreed)}
                    </span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  {preview.protected} protected (skipped)
                </span>
                <span>·</span>
                <span>{preview.alreadyProcessed} already archived/body-only</span>
              </div>

              <Button
                onClick={handleRunClick}
                disabled={
                  stepUpLoading ||
                  runMutation.isPending ||
                  (preview.willArchive + preview.willBeMetadataOnly + preview.willPurge === 0)
                }
                className="w-full gap-2"
              >
                {(stepUpLoading || runMutation.isPending) && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Run Cleanup Now
              </Button>
              {preview.willArchive + preview.willBeMetadataOnly + preview.willPurge === 0 && (
                <p className="text-center text-xs text-gray-400">Nothing to clean up right now.</p>
              )}
            </div>
          ) : (
            <p className="py-4 text-sm text-gray-400">Failed to load preview.</p>
          )}
        </CardContent>
      </Card>

      {/* ---- Job history ---- */}
      <Card className="border-white/80 bg-white/95 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Archive className="h-4 w-4 text-brand-700" />
            Cleanup history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : logs.length === 0 ? (
            <p className="py-4 text-sm text-gray-400 italic">No cleanup runs yet.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {logs.map((log) => (
                <div key={log.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {formatDistanceToNow(new Date(log.startedAt), { addSuffix: true })}
                      </span>
                      <Badge
                        variant="outline"
                        className={log.triggeredBy === 'manual'
                          ? 'border-brand-200 bg-brand-50 text-brand-700 text-[10px] py-0'
                          : 'border-gray-200 bg-gray-50 text-gray-500 text-[10px] py-0'
                        }
                      >
                        {log.triggeredBy}
                      </Badge>
                      {log.errorCount > 0 && (
                        <Badge variant="outline" className="border-critical-100 bg-critical-50 text-critical text-[10px] py-0">
                          {log.errorCount} error{log.errorCount > 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {log.emailsArchived} archived · {log.emailsMetaOnly} body-only · {log.emailsPurged} purged
                      {log.attachmentsPurged > 0 && ` · ${log.attachmentsPurged} attachment records`}
                      {Number(log.bytesFreed) > 0 && ` · ${formatBytes(Number(log.bytesFreed))} freed`}
                    </p>
                  </div>
                  {!log.completedAt && (
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Step-up dialog ---- */}
      <Dialog open={stepUpOpen} onOpenChange={(open) => { if (!open) setStepUpOpen(false) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Verify your identity</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleStepUpSubmit} className="space-y-4">
            {stepUpError && <InlineNotice variant="error">{stepUpError}</InlineNotice>}
            <div className="space-y-1.5">
              <Label htmlFor="cleanup-step-up-code">
                {stepUpMethod === 'totp'
                  ? 'Enter the 6-digit code from your authenticator app'
                  : 'Enter the verification code sent to your email'}
              </Label>
              <Input
                id="cleanup-step-up-code"
                value={stepUpCode}
                onChange={(e) => setStepUpCode(e.target.value)}
                placeholder="000000"
                maxLength={6}
                autoComplete="one-time-code"
                inputMode="numeric"
                className="text-center text-lg tracking-widest"
              />
            </div>
            <Button type="submit" className="w-full" disabled={stepUpLoading || !stepUpCode.trim()}>
              {stepUpLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm and Run Cleanup
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-component
// ---------------------------------------------------------------------------

function StatTile({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
}) {
  return (
    <div className="rounded-xl border border-gray-200/80 bg-gray-50/60 p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        {icon}
        {label}
      </div>
      <p className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}
