'use client'

import { Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ACTION_ITEM_MAX_LENGTH } from '@/lib/action-items'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  PRIORITY_LABELS,
  PRIORITY_LEVELS,
  priorityBucketFromScore,
  type TaskDraft,
} from './task-page-types'

export function TaskDraftCard({
  card,
  onChange,
  onRemove,
}: {
  card: TaskDraft
  onChange: (patch: Partial<TaskDraft>) => void
  onRemove: () => void
}) {
  const deadline = card.explicitDeadline || card.inferredDeadline || ''
  const priorityBucket = priorityBucketFromScore(card.priorityScore)

  return (
    <div className="relative rounded-lg border bg-card p-3 space-y-2">
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove this task"
        className="absolute right-2 top-2 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
      >
        <X className="size-3.5" />
      </button>

      <Input
        value={card.title}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder="Task title"
        className="h-9 pr-7 text-sm font-medium"
      />

      {card.splitReason && (
        <p className="text-[11px] italic text-muted-foreground">{card.splitReason}</p>
      )}

      {card.summary && (
        <Textarea
          value={card.summary}
          onChange={(e) => onChange({ summary: e.target.value })}
          rows={2}
          className="resize-none text-xs"
        />
      )}

      {card.actionItems.length > 0 && (
        <div className="space-y-1">
          {card.actionItems.map((item, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <Input
                value={item}
                maxLength={ACTION_ITEM_MAX_LENGTH}
                onChange={(e) => {
                  const next = [...card.actionItems]
                  next[index] = e.target.value
                  onChange({ actionItems: next })
                }}
                className="h-7 text-xs"
              />
              <button
                type="button"
                onClick={() => onChange({ actionItems: card.actionItems.filter((_, itemIndex) => itemIndex !== index) })}
                className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => onChange({ actionItems: [...card.actionItems, ''] })}
        className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <Plus className="size-3" /> Add item
      </button>

      <div className="flex gap-2">
        <Input
          type="date"
          value={deadline}
          onChange={(e) => onChange({ explicitDeadline: e.target.value || null, inferredDeadline: null })}
          className="h-7 flex-1 text-xs"
        />
        <Select
          value={priorityBucket}
          onValueChange={(value) => {
            if (!value) return
            const priority = PRIORITY_LEVELS[value]
            if (priority) {
              onChange({
                urgency: priority.urgency,
                impact: priority.impact,
                priorityScore: priority.score,
              })
            }
          }}
        >
          <SelectTrigger className="h-7 w-[110px] text-xs">
            <SelectValue>{PRIORITY_LABELS[priorityBucket]}</SelectValue>
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
  )
}
