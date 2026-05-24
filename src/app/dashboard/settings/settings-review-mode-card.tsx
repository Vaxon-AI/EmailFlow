'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'
import { getErrorMessage } from '@/lib/api-client'

export function ReviewModeCard({ manualReviewMode }: { manualReviewMode: boolean }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (mode: boolean) => {
      const res = await fetch('/api/settings/review-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualReviewMode: mode }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(getErrorMessage(json, 'Failed to update'))
      return json
    },
    onSuccess: () => {
      toast.success('Email review mode updated')
      queryClient.invalidateQueries({ queryKey: ['auth-me'] })
    },
    onError: (err: Error) => {
      showError(err.message || 'Failed to update review mode')
    },
  })

  return (
    <Card className="border-white/80 bg-white/95 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4 text-brand-700" />
          Email Review Mode
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-4 rounded-2xl border border-gray-200/80 bg-gray-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 space-y-1">
            <p className="text-sm font-semibold text-gray-900">
              {manualReviewMode ? 'Manual Review (default)' : 'Auto Process'}
            </p>
            <p className="text-sm text-gray-500">
              {manualReviewMode
                ? 'Synced emails wait for your approval before tasks are created. A banner will appear in your inbox.'
                : 'Tasks are created automatically for every action email. Switching back to Manual will not undo existing tasks.'}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => mutation.mutate(!manualReviewMode)}
            disabled={mutation.isPending}
            className="self-end gap-2 sm:self-auto"
          >
            {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Switch to {manualReviewMode ? 'Auto' : 'Manual Review'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
