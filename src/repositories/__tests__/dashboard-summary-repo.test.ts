import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {},
}))

vi.mock('@/repositories/email-repo', () => ({
  countAwaitingReview: vi.fn(),
}))

import {
  buildFeedback,
  getMomentumRange,
  getPeriodRange,
  resolveAllTimeSummaryData,
} from '@/repositories/dashboard-summary-repo'

describe('dashboard-summary-repo helpers', () => {
  describe('buildFeedback', () => {
    it('returns the all-time summary copy for all view', () => {
      expect(buildFeedback('all', 4, 2, 1, {
        total: 10,
        pending: 2,
        active: 3,
        completed: 5,
      })).toEqual({
        label: 'Workspace Summary',
        tone: 'neutral',
        message: '5 tasks completed overall, 5 currently open.',
      })
    })

    it('returns all caught up for today when nothing is due', () => {
      expect(buildFeedback('today', 0, 0, 0, {
        total: 0,
        pending: 0,
        active: 0,
        completed: 0,
      })).toEqual({
        label: 'All caught up',
        tone: 'success',
        message: 'No due or overdue work is waiting today.',
      })
    })

    it('returns needs attention for week when backlog is high', () => {
      expect(buildFeedback('week', 1, 6, 3, {
        total: 20,
        pending: 4,
        active: 5,
        completed: 11,
      })).toEqual({
        label: 'Needs attention',
        tone: 'warning',
        message: '6 due or overdue tasks need follow-up this week.',
      })
    })
  })

  describe('getPeriodRange', () => {
    it('returns null for all view', () => {
      expect(getPeriodRange('all', 0, new Date('2026-05-24T12:00:00.000Z'))).toBeNull()
    })

    it('builds a single-day local range for today', () => {
      const range = getPeriodRange('today', 600, new Date('2026-05-24T01:30:00.000Z'))

      expect(range).toEqual({
        start: new Date('2026-05-23T10:00:00.000Z'),
        end: new Date('2026-05-24T10:00:00.000Z'),
      })
    })

    it('builds a monday-start week range in local time', () => {
      const range = getPeriodRange('week', 600, new Date('2026-05-24T01:30:00.000Z'))

      expect(range).toEqual({
        start: new Date('2026-05-18T10:00:00.000Z'),
        end: new Date('2026-05-25T10:00:00.000Z'),
      })
    })
  })

  describe('getMomentumRange', () => {
    it('reuses the period range for non-all views', () => {
      expect(getMomentumRange('today', undefined, 0, new Date('2026-05-24T12:00:00.000Z'))).toEqual({
        start: new Date('2026-05-24T00:00:00.000Z'),
        end: new Date('2026-05-25T00:00:00.000Z'),
      })
    })

    it('builds a capped all-time momentum window from momentumEnd', () => {
      expect(getMomentumRange('all', '2026-05-20', 0, new Date('2026-05-24T12:00:00.000Z'))).toEqual({
        start: new Date('2026-05-07T00:00:00.000Z'),
        end: new Date('2026-05-21T00:00:00.000Z'),
      })
    })

    it('caps future momentumEnd to the current local day', () => {
      expect(getMomentumRange('all', '2026-05-30', 600, new Date('2026-05-24T01:30:00.000Z'))).toEqual({
        start: new Date('2026-05-10T10:00:00.000Z'),
        end: new Date('2026-05-24T10:00:00.000Z'),
      })
    })
  })

  describe('resolveAllTimeSummaryData', () => {
    const currentPeriod = {
      emailGroups: [{ classification: 'action', _count: { id: 1 } }],
      linkedActionEmails: 1,
      needsReviewCount: 2,
      trackedCount: 3,
      taskGroups: [{ status: 'active', _count: { id: 4 } }],
      aiTaskGroups: [{ status: 'active', _count: { id: 5 } }],
      dueOrOverdueCount: 6,
      overdueCount: 1,
      userInfo: null,
      tasks: [{ id: 'task-1' }],
      attentionEmails: [{ id: 'email-1', subject: 'A', sender: 'S', classification: 'action' }],
      completedMomentumTasks: [],
      createdMomentumTasks: [],
      actionMomentumEmails: [],
    } as any

    it('falls back to current-period data when all-time data is absent', () => {
      expect(resolveAllTimeSummaryData(currentPeriod, null)).toEqual({
        emailGroups: currentPeriod.emailGroups,
        linkedActionEmails: 1,
        needsReviewCount: 2,
        trackedCount: 3,
        taskGroups: currentPeriod.taskGroups,
        aiTaskGroups: currentPeriod.aiTaskGroups,
        tasks: currentPeriod.tasks,
        attentionEmails: currentPeriod.attentionEmails,
        attentionEmailCount: 1,
      })
    })

    it('prefers explicit all-time values when provided', () => {
      expect(resolveAllTimeSummaryData(currentPeriod, {
        emailGroups: [{ classification: 'ignore', _count: { id: 9 } }],
        linkedActionEmails: 8,
        needsReviewCount: 7,
        trackedCount: 6,
        taskGroups: [{ status: 'completed', _count: { id: 5 } }],
        aiTaskGroups: [{ status: 'completed', _count: { id: 4 } }],
        tasks: [{ id: 'task-all-time' }],
        attentionEmails: [{ id: 'email-all-time', subject: 'B', sender: 'T', classification: 'action' }],
        attentionEmailCount: 11,
      } as any)).toEqual({
        emailGroups: [{ classification: 'ignore', _count: { id: 9 } }],
        linkedActionEmails: 8,
        needsReviewCount: 7,
        trackedCount: 6,
        taskGroups: [{ status: 'completed', _count: { id: 5 } }],
        aiTaskGroups: [{ status: 'completed', _count: { id: 4 } }],
        tasks: [{ id: 'task-all-time' }],
        attentionEmails: [{ id: 'email-all-time', subject: 'B', sender: 'T', classification: 'action' }],
        attentionEmailCount: 11,
      })
    })
  })
})
