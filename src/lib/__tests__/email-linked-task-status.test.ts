import { describe, expect, it } from 'vitest'

import { getEmailLinkedTaskState } from '../email-linked-task-status'

describe('getEmailLinkedTaskState', () => {
  it('returns null when there are no effective linked tasks', () => {
    expect(getEmailLinkedTaskState()).toBeNull()
    expect(getEmailLinkedTaskState([{ task: null }])).toBeNull()  })

  it('prioritizes unfinished task states over completed tasks', () => {
    expect(getEmailLinkedTaskState([
      { task: { status: 'completed' } },
      { task: { status: 'ai_suggestion' } },
    ])).toBe('ai_suggestion')
    expect(getEmailLinkedTaskState([
      { task: { status: 'completed' } },
      { task: { status: 'active' } },
    ])).toBe('active')
  })

  it('returns completed only when all effective linked tasks are completed', () => {
    expect(getEmailLinkedTaskState([
      { task: { status: 'completed' } },
      { task: { status: 'completed' } },
    ])).toBe('completed')
  })
})

