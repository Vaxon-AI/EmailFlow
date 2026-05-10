'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { InlineNotice } from '@/components/inline-notice'
import {
  Archive,
  ExternalLink,
  Loader2,
  Plus,
  Shield,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'
import Link from 'next/link'
import { CACHE_TIME } from '@/lib/query-cache'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RetentionPolicy = {
  metadataOnlyAfterDays: number
  purgeAfterDays: number
  purgeGracePeriodDays: number
  taskDoneArchiveAfterDays: number
  taskDoneMetadataOnlyAfterDays: number
  taskDoneRestoreWindowDays: number
  attachmentPurgeAfterDays: number
  staleReviewDismissAfterDays: number
  taskRetainAfterDays: number
}

const TASK_RETAIN_OPTIONS = [7, 14, 30, 60] as const

type ProtectionRule = {
  id: string
  ruleType: 'CONTACT' | 'DOMAIN' | 'LABEL'
  value: string
  createdAt: string
}

const RULE_TYPE_LABELS: Record<ProtectionRule['ruleType'], string> = {
  CONTACT: 'Contact',
  DOMAIN: 'Domain',
  LABEL: 'Label',
}

const RULE_TYPE_COLORS: Record<ProtectionRule['ruleType'], string> = {
  CONTACT: 'bg-brand-50 text-brand-700 border-brand-200',
  DOMAIN: 'bg-purple-50 text-purple-700 border-purple-200',
  LABEL: 'bg-warning-50 text-warning-700 border-warning-100',
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RetentionPolicyCard() {
  const queryClient = useQueryClient()
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState<Partial<RetentionPolicy>>({})
  const [newRuleType, setNewRuleType] = useState<ProtectionRule['ruleType']>('CONTACT')
  const [newRuleValue, setNewRuleValue] = useState('')
  const [addRuleError, setAddRuleError] = useState('')

  // ---- Queries ----

  const { data: policyRes, isLoading: policyLoading } = useQuery({
    queryKey: ['retention-policy'],
    queryFn: () => fetch('/api/settings/retention-policy').then((r) => r.json()),
    staleTime: CACHE_TIME.list,
  })

  const { data: rulesRes, isLoading: rulesLoading } = useQuery({
    queryKey: ['retention-whitelist'],
    queryFn: () => fetch('/api/settings/retention-whitelist').then((r) => r.json()),
    staleTime: CACHE_TIME.list,
  })

  const policy: RetentionPolicy | null = policyRes?.data ?? null
  const rules: ProtectionRule[] = rulesRes?.data ?? []

  // ---- Mutations ----

  const updatePolicyMutation = useMutation({
    mutationFn: async (updates: Partial<RetentionPolicy>) => {
      const res = await fetch('/api/settings/retention-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message || 'Failed to update policy')
      return json
    },
    onSuccess: () => {
      toast.success('Retention policy updated')
      queryClient.invalidateQueries({ queryKey: ['retention-policy'] })
      setEditMode(false)
      setDraft({})
    },
    onError: (err: Error) => showError(err.message),
  })

  const addRuleMutation = useMutation({
    mutationFn: async ({ ruleType, value }: { ruleType: ProtectionRule['ruleType']; value: string }) => {
      const res = await fetch('/api/settings/retention-whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleType, value }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message || json?.error || 'Failed to add rule')
      return json
    },
    onSuccess: () => {
      toast.success('Whitelist rule added')
      queryClient.invalidateQueries({ queryKey: ['retention-whitelist'] })
      setNewRuleValue('')
      setAddRuleError('')
    },
    onError: (err: Error) => setAddRuleError(err.message),
  })

  const removeRuleMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      const res = await fetch(`/api/settings/retention-whitelist/${ruleId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message || 'Failed to remove rule')
      return json
    },
    onSuccess: () => {
      toast.success('Rule removed')
      queryClient.invalidateQueries({ queryKey: ['retention-whitelist'] })
    },
    onError: (err: Error) => showError(err.message),
  })

  // ---- Handlers ----

  function startEdit() {
    if (!policy) return
    setDraft({ ...policy })
    setEditMode(true)
  }

  function cancelEdit() {
    setDraft({})
    setEditMode(false)
  }

  function handleDraftChange(key: keyof RetentionPolicy, raw: string) {
    const val = parseInt(raw, 10)
    if (!isNaN(val) && val >= 0) {
      setDraft((prev) => ({ ...prev, [key]: val }))
    }
  }

  function submitEdit() {
    if (Object.keys(draft).length === 0) {
      setEditMode(false)
      return
    }
    updatePolicyMutation.mutate(draft)
  }

  function handleAddRule(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newRuleValue.trim()
    if (!trimmed) {
      setAddRuleError('Value is required')
      return
    }
    setAddRuleError('')
    addRuleMutation.mutate({ ruleType: newRuleType, value: trimmed })
  }

  const displayPolicy = editMode
    ? { ...policy, ...draft } as RetentionPolicy
    : policy

  // ---- Render ----

  return (
    <Card className="border-white/80 bg-white/95 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Archive className="h-4 w-4 text-brand-700" />
          Email Retention
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* ---- Policy thresholds ---- */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">Cleanup schedule</p>
            {!editMode ? (
              <Button variant="outline" size="sm" onClick={startEdit} disabled={policyLoading}>
                Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={cancelEdit}>Cancel</Button>
                <Button size="sm" onClick={submitEdit} disabled={updatePolicyMutation.isPending}>
                  {updatePolicyMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Save
                </Button>
              </div>
            )}
          </div>

          {policyLoading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : displayPolicy ? (
            <div className="rounded-xl border border-gray-200/80 bg-gray-50/60 p-4 space-y-4">
              {/* General emails */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  General emails (no associated task)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <PolicyField
                    label="Body-only after"
                    unit="days"
                    value={displayPolicy.metadataOnlyAfterDays}
                    editing={editMode}
                    onChange={(v) => handleDraftChange('metadataOnlyAfterDays', v)}
                  />
                  <PolicyField
                    label="Fully purge after"
                    unit="days"
                    value={displayPolicy.purgeAfterDays}
                    editing={editMode}
                    onChange={(v) => handleDraftChange('purgeAfterDays', v)}
                  />
                </div>
              </div>

              {/* Task-done emails — archive timing hidden (handled automatically) */}
              <div className="space-y-2 border-t border-gray-200/80 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Emails linked to completed tasks
                </p>
                <p className="text-[11px] text-gray-400">
                  Cleanup begins automatically as soon as the task is marked done. You can adjust the timing below.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <PolicyField
                    label="Body-only after"
                    unit="days from completion"
                    value={displayPolicy.taskDoneMetadataOnlyAfterDays}
                    editing={editMode}
                    onChange={(v) => handleDraftChange('taskDoneMetadataOnlyAfterDays', v)}
                  />
                  <PolicyField
                    label="Restore window"
                    unit="days"
                    value={displayPolicy.taskDoneRestoreWindowDays}
                    editing={editMode}
                    onChange={(v) => handleDraftChange('taskDoneRestoreWindowDays', v)}
                    hint="How long the body can be restored after going body-only"
                  />
                </div>
              </div>

              {/* Permanent deletion grace period */}
              <div className="space-y-2 border-t border-gray-200/80 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Permanent deletion
                </p>
                <PolicyField
                  label="Remove from our database after"
                  unit="days post-purge"
                  value={displayPolicy.purgeGracePeriodDays}
                  editing={editMode}
                  onChange={(v) => handleDraftChange('purgeGracePeriodDays', v)}
                  hint="Once an email is purged, it stays as a header-only stub for this many extra days, then the row is deleted permanently. After deletion, syncs will not re-fetch it."
                />
              </div>

              {/* Manual review queue auto-dismiss */}
              <div className="space-y-2 border-t border-gray-200/80 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Manual review queue
                </p>
                <PolicyField
                  label="Auto-dismiss after"
                  unit="days waiting"
                  value={displayPolicy.staleReviewDismissAfterDays}
                  editing={editMode}
                  onChange={(v) => handleDraftChange('staleReviewDismissAfterDays', v)}
                  hint="Pending-review emails older than this are moved to ignored automatically."
                />
              </div>

              {/* Task cleanup */}
              <div className="space-y-2 border-t border-gray-200/80 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Task cleanup
                </p>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">Auto-clean completed tasks after</Label>
                  {editMode ? (
                    <select
                      value={displayPolicy.taskRetainAfterDays}
                      onChange={(e) => handleDraftChange('taskRetainAfterDays', e.target.value)}
                      className="h-8 rounded-md border border-gray-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                    >
                      {TASK_RETAIN_OPTIONS.map((d) => (
                        <option key={d} value={d}>{d} days</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm font-medium text-gray-900">
                      {displayPolicy.taskRetainAfterDays} <span className="font-normal text-gray-500 text-xs">days</span>
                    </p>
                  )}
                  <p className="text-[11px] text-gray-400">
                    Standalone tasks (manual + paste-text) are removed permanently after this period.
                    Tasks linked to emails are hidden from view but kept until their source emails are also fully removed — so you can still trace them from the email side.
                  </p>
                </div>
              </div>

            </div>
          ) : null}

          <div className="flex justify-end">
            <Link href="/dashboard/settings/cleanup">
              <Button variant="outline" size="sm" className="gap-2 text-xs">
                <ExternalLink className="h-3.5 w-3.5" />
                Preview & run cleanup
              </Button>
            </Link>
          </div>
        </div>

        {/* ---- Whitelist / protection rules ---- */}
        <div className="space-y-3 border-t border-gray-200/60 pt-5">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-success" />
            <p className="text-sm font-medium text-gray-900">Protection whitelist</p>
          </div>
          <p className="text-xs text-gray-500">
            Emails matching any of these rules are never cleaned up, regardless of age.
            STARRED and IMPORTANT emails are always protected automatically.
          </p>

          {/* Existing rules */}
          {rulesLoading ? (
            <div className="flex items-center gap-2 py-1 text-sm text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading rules…
            </div>
          ) : rules.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No custom rules yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
                >
                  <Badge
                    variant="outline"
                    className={`px-1.5 py-0 text-[10px] ${RULE_TYPE_COLORS[rule.ruleType]}`}
                  >
                    {RULE_TYPE_LABELS[rule.ruleType]}
                  </Badge>
                  <span className="text-gray-700">{rule.value}</span>
                  <button
                    onClick={() => removeRuleMutation.mutate(rule.id)}
                    disabled={removeRuleMutation.isPending}
                    className="ml-0.5 rounded-full p-0.5 text-gray-400 hover:bg-critical-50 hover:text-critical disabled:opacity-50"
                    aria-label="Remove rule"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add rule form */}
          <form onSubmit={handleAddRule} className="flex items-end gap-2 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Type</Label>
              <select
                value={newRuleType}
                onChange={(e) => setNewRuleType(e.target.value as ProtectionRule['ruleType'])}
                className="h-8 rounded-md border border-gray-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
              >
                <option value="CONTACT">Contact (email)</option>
                <option value="DOMAIN">Domain</option>
                <option value="LABEL">Label</option>
              </select>
            </div>
            <div className="space-y-1 min-w-[180px]">
              <Label className="text-xs text-gray-600">
                {newRuleType === 'CONTACT' ? 'e.g. alice@acme.com' :
                 newRuleType === 'DOMAIN' ? 'e.g. acme.com' :
                 'e.g. STARRED'}
              </Label>
              <Input
                value={newRuleValue}
                onChange={(e) => setNewRuleValue(e.target.value)}
                placeholder={
                  newRuleType === 'CONTACT' ? 'alice@acme.com' :
                  newRuleType === 'DOMAIN' ? 'acme.com' :
                  'IMPORTANT'
                }
                className="h-8 text-sm"
              />
            </div>
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={addRuleMutation.isPending}
            >
              {addRuleMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Plus className="h-3.5 w-3.5" />
              }
              Add
            </Button>
          </form>
          {addRuleError && (
            <InlineNotice variant="error" className="text-xs">{addRuleError}</InlineNotice>
          )}
        </div>

      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Sub-component: single policy field (read or edit mode)
// ---------------------------------------------------------------------------

function PolicyField({
  label,
  unit,
  value,
  editing,
  onChange,
  hint,
}: {
  label: string
  unit: string
  value: number
  editing: boolean
  onChange: (v: string) => void
  hint?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600">{label}</Label>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={0}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-20 text-sm"
          />
          <span className="text-xs text-gray-500 whitespace-nowrap">{unit}</span>
        </div>
      ) : (
        <p className="text-sm font-medium text-gray-900">
          {value} <span className="font-normal text-gray-500 text-xs">{unit}</span>
        </p>
      )}
      {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
  )
}
