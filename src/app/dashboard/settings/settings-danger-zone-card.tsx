'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { InlineNotice } from '@/components/inline-notice'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

const DELETE_CONFIRMATION_PHRASE = 'delete my account'

export function DangerZoneCard({ onDeleted }: { onDeleted: () => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const phraseMatches =
    confirmText.trim().toLowerCase() === DELETE_CONFIRMATION_PHRASE

  function openConfirm() {
    setError('')
    setConfirmText('')
    setConfirmOpen(true)
  }

  async function handleDelete() {
    if (!phraseMatches) return
    setConfirmOpen(false)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: confirmText }),
      })
      const data = await res.json()
      if (!data.success) {
        const msg =
          typeof data.error === 'string'
            ? data.error
            : data.error?.message ?? data.error?.code ?? 'Failed to delete account'
        throw new Error(msg)
      }
      toast.success('Account deleted')
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Card className="border-critical-100/60 bg-white/95 shadow-sm">
        <CardHeader >
          <CardTitle className="flex items-center gap-2 text-base text-critical-700">
            <AlertTriangle className="h-4 w-4" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <InlineNotice variant="error">{error}</InlineNotice>}
          <div className="flex flex-col gap-4 rounded-2xl border border-critical-100/60 bg-critical-50/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-semibold text-gray-900">Delete this account</p>
              <p className="text-sm text-gray-500">
                Permanently removes your account and all associated data. This cannot be undone.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={openConfirm}
              disabled={loading}
              className="gap-2 self-end border-critical-100 text-critical-700 hover:bg-critical-50 hover:text-critical-700 sm:self-auto"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete account
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Typed-confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-critical-700">
              <AlertTriangle className="h-4 w-4" />
              Delete your account?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            This will permanently delete your account, all emails, tasks, and connected data.
            There is <strong>no way to undo this</strong>.
          </p>
          <p className="text-sm text-gray-600">
            Your free-quota usage history will be retained. Re-registering with the same email,
            or rebinding the same Gmail account, will <strong>not reset your quota</strong>.
          </p>
          <div className="space-y-2 pt-1">
            <p className="text-sm text-gray-600">
              Type <strong>delete my account</strong> to confirm.
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="delete my account"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && phraseMatches) handleDelete()
              }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={loading || !phraseMatches}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Yes, delete my account'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
