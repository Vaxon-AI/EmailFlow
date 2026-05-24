import { describe, expect, it } from 'vitest'

import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  activeTaskStatuses,
  getTaskStatusLabel,
  isTaskStatus,
} from '../task-status'

describe('isTaskStatus', () => {
  it('returns true for every known status', () => {
    for (const status of TASK_STATUSES) {
      expect(isTaskStatus(status)).toBe(true)
    }
  })

  it('returns false for unknown values', () => {
    expect(isTaskStatus('archived')).toBe(false)
    expect(isTaskStatus('')).toBe(false)
    expect(isTaskStatus(null)).toBe(false)
    expect(isTaskStatus(undefined)).toBe(false)
    expect(isTaskStatus(42)).toBe(false)
    expect(isTaskStatus({ status: 'active' })).toBe(false)
  })
})

describe('getTaskStatusLabel', () => {
  it('returns the label for every known status', () => {
    expect(getTaskStatusLabel('ai_suggestion')).toBe(TASK_STATUS_LABELS.ai_suggestion)
    expect(getTaskStatusLabel('active')).toBe(TASK_STATUS_LABELS.active)
    expect(getTaskStatusLabel('completed')).toBe(TASK_STATUS_LABELS.completed)
  })

  it('falls back to the ai_suggestion label for unknown or missing values', () => {
    expect(getTaskStatusLabel(undefined)).toBe(TASK_STATUS_LABELS.ai_suggestion)
    expect(getTaskStatusLabel(null)).toBe(TASK_STATUS_LABELS.ai_suggestion)
    expect(getTaskStatusLabel('mystery')).toBe(TASK_STATUS_LABELS.ai_suggestion)
  })
})

describe('activeTaskStatuses', () => {
  it('lists the statuses that count as "open" work — not completed', () => {
    const active = activeTaskStatuses()
    expect(active).toEqual(['ai_suggestion', 'active'])
    expect(active).not.toContain('completed')
  })
})
