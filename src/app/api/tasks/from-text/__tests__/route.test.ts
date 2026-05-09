import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

vi.mock('@/ai/skills/extract-task', () => ({
  extractTask: vi.fn(),
}))

vi.mock('@/ai/skills/score-priority', () => ({
  scorePriority: vi.fn(),
}))

import { getAuthUser } from '@/lib/api-helpers'
import { extractTask } from '@/ai/skills/extract-task'
import { scorePriority } from '@/ai/skills/score-priority'
import { POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockExtractTask = vi.mocked(extractTask)
const mockScorePriority = vi.mocked(scorePriority)

const EXTRACTED_TASK = {
  title: 'Review the contract',
  summary: 'Legal review needed before signing',
  actionItems: ['Read through', 'Flag issues'],
  explicitDeadline: '2026-05-10',
  inferredDeadline: null,
  deadlineConfidence: 0.9,
  splitReason: null,
}

const PRIORITY_RESULT = {
  urgency: 4,
  impact: 5,
  combinedScore: 20,
  reasoning: 'High stakes legal document',
}

function postRequest(body: object): NextRequest {
  return new NextRequest('http://localhost/api/tasks/from-text', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/tasks/from-text', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
    mockExtractTask.mockResolvedValue({ tasks: [EXTRACTED_TASK] } as never)
    mockScorePriority.mockResolvedValue(PRIORITY_RESULT as never)
  })

  it('returns 400 when text is missing', async () => {
    const res = await POST(postRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 when text is not a string', async () => {
    const res = await POST(postRequest({ text: 42 }))
    expect(res.status).toBe(400)
  })

  it('returns 422 when no task can be extracted', async () => {
    mockExtractTask.mockResolvedValue({ tasks: [] } as never)

    const res = await POST(postRequest({ text: 'Nothing actionable here' }))

    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe('EXTRACTION_EMPTY')
  })

  it('extracts a single task and scores priority from text', async () => {
    const res = await POST(postRequest({ text: 'Please review the contract before Friday and flag any issues.' }))

    expect(mockExtractTask).toHaveBeenCalled()
    expect(mockScorePriority).toHaveBeenCalledWith({
      title: EXTRACTED_TASK.title,
      summary: EXTRACTED_TASK.summary,
      actionItems: EXTRACTED_TASK.actionItems,
      sender: '',
      currentDate: expect.any(String),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.tasks).toHaveLength(1)
    expect(body.data.tasks[0].title).toBe('Review the contract')
    expect(body.data.tasks[0].urgency).toBe(4)
    expect(body.data.tasks[0].impact).toBe(5)
    expect(body.data.tasks[0].priorityScore).toBe(20)
    expect(body.data.tasks[0].splitReason).toBeNull()
  })

  it('returns multiple drafts and scores priority for each candidate', async () => {
    const candidates = [
      { ...EXTRACTED_TASK, title: 'Ship beta', splitReason: 'Independent deliverable' },
      { ...EXTRACTED_TASK, title: 'Set up landing page', splitReason: 'Independent deliverable' },
      { ...EXTRACTED_TASK, title: 'Email investors', splitReason: 'Independent deliverable' },
    ]
    mockExtractTask.mockResolvedValue({ tasks: candidates } as never)

    const res = await POST(postRequest({ text: 'Three independent things to do this week...' }))

    expect(res.status).toBe(200)
    expect(mockScorePriority).toHaveBeenCalledTimes(3)
    const body = await res.json()
    expect(body.data.tasks).toHaveLength(3)
    expect(body.data.tasks.map((t: { title: string }) => t.title)).toEqual([
      'Ship beta',
      'Set up landing page',
      'Email investors',
    ])
    for (const draft of body.data.tasks) {
      expect(draft.urgency).toBe(4)
      expect(draft.impact).toBe(5)
      expect(draft.priorityScore).toBe(20)
      expect(draft.splitReason).toBe('Independent deliverable')
    }
  })

  it('truncates text to 1000 characters before extraction', async () => {
    const longText = 'x'.repeat(2000)
    await POST(postRequest({ text: longText }))

    const callArg = mockExtractTask.mock.calls[0][0]
    expect(callArg.body?.length).toBe(1000)
    expect(callArg.bodyPreview?.length).toBe(1000)
  })
})
