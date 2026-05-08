import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/repositories/email-repo', () => ({
  findEmailById: vi.fn(),
  updateClassification: vi.fn(),
  setEmailBucket: vi.fn(),
}))

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

import * as emailRepo from '@/repositories/email-repo'
import { getAuthUser } from '@/lib/api-helpers'
import { GET, PATCH } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockFindEmailById = vi.mocked(emailRepo.findEmailById)
const mockUpdateClassification = vi.mocked(emailRepo.updateClassification)
const mockSetEmailBucket = vi.mocked(emailRepo.setEmailBucket)

const STORED_EMAIL = {
  id: 'email-1',
  subject: 'Hello',
  classification: 'action',
  classConfidence: 0.9,
}

describe('GET /api/emails/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns the email when found', async () => {
    mockFindEmailById.mockResolvedValue(STORED_EMAIL as never)

    const res = await GET(new NextRequest('http://localhost/api/emails/email-1'), {
      params: Promise.resolve({ id: 'email-1' }),
    })

    expect(mockFindEmailById).toHaveBeenCalledWith('user-1', 'email-1')
    expect(res.status).toBe(200)
    expect((await res.json()).data.id).toBe('email-1')
  })

  it('returns 404 when email does not exist', async () => {
    mockFindEmailById.mockResolvedValue(null)

    const res = await GET(new NextRequest('http://localhost/api/emails/missing'), {
      params: Promise.resolve({ id: 'missing' }),
    })

    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/emails/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns 404 when email does not exist', async () => {
    mockFindEmailById.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/emails/missing', {
      method: 'PATCH',
      body: JSON.stringify({ classification: 'ignore' }),
      headers: { 'content-type': 'application/json' },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: 'missing' }) })

    expect(res.status).toBe(404)
  })

  it('updates classification and returns updated email', async () => {
    mockFindEmailById.mockResolvedValue(STORED_EMAIL as never)
    const updated = { ...STORED_EMAIL, classification: 'ignore' }
    mockUpdateClassification.mockResolvedValue(updated as never)

    const req = new NextRequest('http://localhost/api/emails/email-1', {
      method: 'PATCH',
      body: JSON.stringify({ classification: 'ignore' }),
      headers: { 'content-type': 'application/json' },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: 'email-1' }) })

    expect(mockUpdateClassification).toHaveBeenCalledWith('email-1', {
      category: 'ignore',
      confidence: 0.9,
      reasoning: 'Manually updated to ignore',
      isWorkRelated: false,
    })
    expect(res.status).toBe(200)
    expect((await res.json()).data.classification).toBe('ignore')
  })

  it('returns 400 when no valid fields are provided', async () => {
    mockFindEmailById.mockResolvedValue(STORED_EMAIL as never)

    const req = new NextRequest('http://localhost/api/emails/email-1', {
      method: 'PATCH',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: 'email-1' }) })

    expect(res.status).toBe(400)
  })

  it('sets isWorkRelated to true for non-ignore classifications', async () => {
    mockFindEmailById.mockResolvedValue({ ...STORED_EMAIL, classConfidence: 0.8 } as never)
    mockUpdateClassification.mockResolvedValue({} as never)

    const req = new NextRequest('http://localhost/api/emails/email-1', {
      method: 'PATCH',
      body: JSON.stringify({ classification: 'action' }),
      headers: { 'content-type': 'application/json' },
    })

    await PATCH(req, { params: Promise.resolve({ id: 'email-1' }) })

    expect(mockUpdateClassification).toHaveBeenCalledWith('email-1', expect.objectContaining({
      isWorkRelated: true,
    }))
  })

  it('routes bucket=tracked to setEmailBucket (not updateClassification)', async () => {
    mockFindEmailById.mockResolvedValue(STORED_EMAIL as never)
    mockSetEmailBucket.mockResolvedValue({ ...STORED_EMAIL, actioned: true } as never)

    const req = new NextRequest('http://localhost/api/emails/email-1', {
      method: 'PATCH',
      body: JSON.stringify({ bucket: 'tracked' }),
      headers: { 'content-type': 'application/json' },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: 'email-1' }) })

    expect(mockSetEmailBucket).toHaveBeenCalledWith('email-1', 'tracked')
    expect(mockUpdateClassification).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it('rejects unknown bucket values', async () => {
    mockFindEmailById.mockResolvedValue(STORED_EMAIL as never)

    const req = new NextRequest('http://localhost/api/emails/email-1', {
      method: 'PATCH',
      body: JSON.stringify({ bucket: 'archived' }),
      headers: { 'content-type': 'application/json' },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: 'email-1' }) })

    expect(res.status).toBe(400)
    expect(mockSetEmailBucket).not.toHaveBeenCalled()
  })

  it('prefers bucket over classification when both are provided', async () => {
    mockFindEmailById.mockResolvedValue(STORED_EMAIL as never)
    mockSetEmailBucket.mockResolvedValue(STORED_EMAIL as never)

    const req = new NextRequest('http://localhost/api/emails/email-1', {
      method: 'PATCH',
      body: JSON.stringify({ bucket: 'fyi', classification: 'ignore' }),
      headers: { 'content-type': 'application/json' },
    })

    await PATCH(req, { params: Promise.resolve({ id: 'email-1' }) })

    expect(mockSetEmailBucket).toHaveBeenCalledWith('email-1', 'fyi')
    expect(mockUpdateClassification).not.toHaveBeenCalled()
  })
})

describe('email-classification helpers', () => {
  it('rolls uncertain emails into the needs_action bucket', async () => {
    const { getEmailBucket } = await import('@/lib/email-classification')
    expect(getEmailBucket({ classification: 'uncertain', actioned: false })).toBe('needs_action')
    expect(getEmailBucket({ classification: 'action', actioned: false })).toBe('needs_action')
    expect(getEmailBucket({ classification: 'awareness', actioned: false })).toBe('fyi')
    expect(getEmailBucket({ classification: 'ignore', actioned: false })).toBe('ignored')
    expect(getEmailBucket({ classification: null })).toBe('needs_action')
  })

  it('returns tracked when actioned is true regardless of classification', async () => {
    const { getEmailBucket } = await import('@/lib/email-classification')
    expect(getEmailBucket({ classification: 'action', actioned: true })).toBe('tracked')
    expect(getEmailBucket({ classification: 'awareness', actioned: true })).toBe('tracked')
    expect(getEmailBucket({ classification: 'uncertain', actioned: true })).toBe('tracked')
  })
})
