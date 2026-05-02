import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/repositories/email-repo', () => ({
  findEmailById: vi.fn(),
  updateClassification: vi.fn(),
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
})
