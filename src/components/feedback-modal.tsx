'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/lib/use-auth'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'

type Category = 'Bug' | 'Idea' | 'Other'

const MAX_MESSAGE = 2000

export function FeedbackModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { user } = useAuth()
  const [category, setCategory] = useState<Category>('Idea')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setEmail(user?.email ?? '')
    } else {
      setCategory('Idea')
      setMessage('')
      setEmail('')
    }
  }, [open, user?.email])

  const handleSubmit = async () => {
    if (!message.trim()) {
      toast.error('Please enter your feedback')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          message: message.trim(),
          email: email.trim() || undefined,
        }),
      })
      if (res.ok) {
        toast.success('Thanks for your feedback!')
        onOpenChange(false)
      } else {
        showError('Failed to submit feedback')
      }
    } catch {
      showError('Failed to submit feedback')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Found a bug or have an idea? Let us know — we read every message.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => v && setCategory(v as Category)}>
              <SelectTrigger size="sm" className="w-full bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {(['Bug', 'Idea', 'Other'] as const).map((value) => (
                  <SelectItem
                    key={value}
                    value={value}
                    className={`cursor-pointer rounded-lg py-1.5 pl-2 text-xs transition-[background-color,color,transform] duration-150 hover:translate-x-0.5 ${
                      category === value
                        ? 'bg-brand-50 text-brand-700 focus:bg-brand-50 focus:text-brand-700'
                        : 'text-slate-600 focus:bg-slate-50 focus:text-slate-800'
                    }`}
                  >
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-message">Message</Label>
            <Textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
              placeholder="Describe what you saw or what you'd like to see..."
              rows={5}
              className="resize-none"
            />
            <div className="text-right text-xs text-muted-foreground">
              {message.length}/{MAX_MESSAGE}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-email">
              Contact email <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="feedback-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !message.trim()}>
            {submitting ? 'Sending...' : 'Send feedback'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
