'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'

type ApiErrorPayload = {
  error?: { message?: string } | string
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const data = await response.json() as ApiErrorPayload
    if (typeof data.error === 'string') return data.error
    return data.error?.message || fallback
  } catch {
    return fallback
  }
}

export function useReplyDraft(emailId: string, initialDraft: string | null | undefined, emailKey: string | undefined) {
  const queryClient = useQueryClient()
  const [replyDraft, setReplyDraft] = useState('')
  const [generatingReply, setGeneratingReply] = useState(false)
  const [savingReply, setSavingReply] = useState(false)

  useEffect(() => {
    setReplyDraft(initialDraft ?? '')
  }, [emailKey, initialDraft])

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

  return {
    replyDraft,
    setReplyDraft,
    generatingReply,
    savingReply,
    generateReply,
    saveReply,
    copyReply,
  }
}
