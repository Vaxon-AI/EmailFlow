'use client'

import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export const SHOW_ERROR_EVENT = 'app:show-error'

export interface ErrorEventDetail {
  message: string
  title?: string
}

export function showError(message: string, title?: string) {
  window.dispatchEvent(
    new CustomEvent<ErrorEventDetail>(SHOW_ERROR_EVENT, {
      detail: { message, title },
    })
  )
}

export function ErrorDialogWatcher() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('Something went wrong')
  const [message, setMessage] = useState('')

  useEffect(() => {
    function handleShowError(e: Event) {
      const { message: msg, title: t } = (e as CustomEvent<ErrorEventDetail>).detail
      setMessage(msg)
      setTitle(t ?? 'Something went wrong')
      setOpen(true)
    }

    window.addEventListener(SHOW_ERROR_EVENT, handleShowError)
    return () => window.removeEventListener(SHOW_ERROR_EVENT, handleShowError)
  }, [])

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setOpen(false) }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-critical" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{message}</p>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
