import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/repositories/email-repo', () => ({
  findEmailById: vi.fn(),
  updateReplyDraft: vi.fn(),
}))

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

vi.mock('@/ai', () => ({
  generateReplyDraft: vi.fn(),
}))

vi.mock('@/types', () => ({
  getPriorityBand: vi.fn().mockReturnValue('medium'),
  getPriorityLabel: vi.fn().mockReturnValue('Medium'),
  getTaskStatusLabel: vi.fn().mockReturnValue('In Progress'),
}))

import * as emailRepo from '@/repositories/email-repo'
import { getAuthUser } from '@/lib/api-helpers'
import { generateReplyDraft } from '@/ai'
import { POST, PATCH } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockFindEmailById = vi.mocked(emailRepo.findEmailById)
const mockUpdateReplyDraft = vi.mocked(emailRepo.updateReplyDraft)
const mockGenerateReplyDraft = vi.mocked(generateReplyDraft)

const ACTION_EMAIL = {
  id: 'email-1',
  subject: 'Please review',
  sender: 'boss@example.com',
  receivedAt: new Date('2026-01-01'),
  bodyPreview: 'Please review the attached document',
  bodyFull: 'Please review the attached document in full detail',
  classification: 'action',
  classReasoning: 'Requires action',
  retentionStatus: 'ACTIVE',
  taskLinks: [],
}

describe('POST /api/emails/[id]/reply-suggestion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns 404 when email does not exist', async () => {
    mockFindEmailById.mockResolvedValue(null)

    const res = await POST(new NextRequest('http://localhost'), {
      params: Promise.resolve({ id: 'missing' }),
    })

    expect(res.status).toBe(404)
  })

  it('returns 400 for purged email', async () => {
    mockFindEmailById.mockResolvedValue({ ...ACTION_EMAIL, retentionStatus: 'PURGED' } as never)

    const res = await POST(new NextRequest('http://localhost'), {
      params: Promise.resolve({ id: 'email-1' }),
    })

    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('EMAIL_CONTENT_UNAVAILABLE')
  })

  it('returns 400 when email is not actionable and has no tasks', async () => {
    mockFindEmailById.mockResolvedValue({ ...ACTION_EMAIL, classification: 'fyi', taskLinks: [] } as never)

    const res = await POST(new NextRequest('http://localhost'), {
      params: Promise.resolve({ id: 'email-1' }),
    })

    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('NOT_ACTIONABLE')
  })

  it('generates and saves reply draft for action email', async () => {
    mockFindEmailById.mockResolvedValue(ACTION_EMAIL as never)
    mockGenerateReplyDraft.mockResolvedValue({ reply: 'Sure, I will review it.' } as never)
    mockUpdateReplyDraft.mockResolvedValue({} as never)

    const res = await POST(new NextRequest('http://localhost'), {
      params: Promise.resolve({ id: 'email-1' }),
    })

    expect(mockGenerateReplyDraft).toHaveBeenCalled()
    expect(mockUpdateReplyDraft).toHaveBeenCalledWith('user-1', 'email-1', 'Sure, I will review it.', true)
    expect(res.status).toBe(200)
    expect((await res.json()).data.reply).toBe('Sure, I will review it.')
  })

  it('allows reply generation for fyi email that has linked tasks', async () => {
    mockFindEmailById.mockResolvedValue({
      ...ACTION_EMAIL,
      classification: 'fyi',
      taskLinks: [{ task: { id: 'task-1', title: 'Review doc', status: 'ai_suggestion', summary: null } }],
    } as never)
    mockGenerateReplyDraft.mockResolvedValue({ reply: 'Thank you for the update.' } as never)
    mockUpdateReplyDraft.mockResolvedValue({} as never)

    const res = await POST(new NextRequest('http://localhost'), {
      params: Promise.resolve({ id: 'email-1' }),
    })

    expect(res.status).toBe(200)
  })
})

describe('PATCH /api/emails/[id]/reply-suggestion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns 400 when reply is empty', async () => {
    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ reply: '   ' }),
      headers: { 'content-type': 'application/json' },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: 'email-1' }) })

    expect(res.status).toBe(400)
  })

  it('returns 400 when reply exceeds 4000 characters', async () => {
    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ reply: 'x'.repeat(4001) }),
      headers: { 'content-type': 'application/json' },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: 'email-1' }) })

    expect(res.status).toBe(400)
  })

  it('saves reply draft and returns it', async () => {
    mockUpdateReplyDraft.mockResolvedValue({ count: 1 } as never)

    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ reply: 'I will get back to you soon.' }),
      headers: { 'content-type': 'application/json' },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: 'email-1' }) })

    expect(mockUpdateReplyDraft).toHaveBeenCalledWith('user-1', 'email-1', 'I will get back to you soon.')
    expect(res.status).toBe(200)
    expect((await res.json()).data.reply).toBe('I will get back to you soon.')
  })

  it('returns 404 when email does not exist', async () => {
    mockUpdateReplyDraft.mockResolvedValue({ count: 0 } as never)

    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ reply: 'hello there' }),
      headers: { 'content-type': 'application/json' },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: 'missing' }) })

    expect(res.status).toBe(404)
  })
})
