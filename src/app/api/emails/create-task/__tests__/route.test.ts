import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

vi.mock('@/lib/quota', () => ({
  getExtractRemaining: vi.fn(),
  incrementExtractUsed: vi.fn(),
  FREE_EXTRACT_LIMIT: 10,
}))

vi.mock('@/services/manual-task-service', () => ({
  createManualTask: vi.fn(),
}))

vi.mock('@/repositories/email-repo', () => ({
  setEmailBucket: vi.fn(),
}))

import { getAuthUser } from '@/lib/api-helpers'
import { setEmailBucket } from '@/repositories/email-repo'
import { createManualTask } from '@/services/manual-task-service'
import { POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockSetEmailBucket = vi.mocked(setEmailBucket)
const mockCreateManualTask = vi.mocked(createManualTask)

function postRequest(body: object): NextRequest {
  return new NextRequest('http://localhost/api/emails/create-task', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/emails/create-task', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1', plan: 'pro' } as never)
    mockCreateManualTask.mockResolvedValue({ id: 'task-1', title: 'T' } as never)
    mockSetEmailBucket.mockResolvedValue(undefined as never)
  })

  it('returns 400 when title or sourceEmailId is missing', async () => {
    expect((await POST(postRequest({ sourceEmailId: 'e1' }))).status).toBe(400)
    expect((await POST(postRequest({ title: 'T' }))).status).toBe(400)
  })

  it('creates task without matter when no projectId is provided', async () => {
    await POST(postRequest({ title: 'T', sourceEmailId: 'e1' }))

    expect(mockCreateManualTask).toHaveBeenCalledWith({
      userId: 'user-1',
      title: 'T',
      summary: undefined,
      actionItems: undefined,
      userSetDeadline: undefined,
      startDate: undefined,
      urgency: undefined,
      impact: undefined,
      priorityScore: undefined,
      projectId: undefined,
      source: 'manual',
      emailIds: ['e1'],
      markLinkedEmailsActioned: false,
      emptyActionItemsValue: undefined,
    })
  })

  it('delegates creation with linked email ids and project id', async () => {
    await POST(postRequest({ title: 'T', sourceEmailId: 'e1', projectId: 'p1' }))

    expect(mockCreateManualTask).toHaveBeenCalledWith({
      userId: 'user-1',
      title: 'T',
      summary: undefined,
      actionItems: undefined,
      userSetDeadline: undefined,
      startDate: undefined,
      urgency: undefined,
      impact: undefined,
      priorityScore: undefined,
      projectId: 'p1',
      source: 'manual',
      emailIds: ['e1'],
      markLinkedEmailsActioned: false,
      emptyActionItemsValue: undefined,
    })
  })

  it('writes startDate when provided', async () => {
    await POST(postRequest({ title: 'T', sourceEmailId: 'e1', startDate: '2026-05-10' }))

    expect(mockCreateManualTask).toHaveBeenCalledWith(expect.objectContaining({
      startDate: '2026-05-10',
    }))
  })
})
