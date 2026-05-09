import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/repositories/email-repo', () => ({
  findEmailsPaginated: vi.fn(),
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
import { GET } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockFindEmailsPaginated = vi.mocked(emailRepo.findEmailsPaginated)

describe('GET /api/emails', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns empty list when user is not authenticated', async () => {
    mockGetAuthUser.mockResolvedValue(null as never)

    const res = await GET(new NextRequest('http://localhost/api/emails'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
    expect(body.meta.totalCount).toBe(0)
  })

  it('returns paginated emails with correct meta', async () => {
    mockFindEmailsPaginated.mockResolvedValue({
      emails: [{ id: 'email-1', subject: 'Hello' }],
      total: 45,
    } as never)

    const res = await GET(new NextRequest('http://localhost/api/emails?page=2&limit=15'))

    expect(mockFindEmailsPaginated).toHaveBeenCalledWith('user-1', { page: 2, limit: 15, classification: undefined })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.meta.page).toBe(2)
    expect(body.meta.totalPages).toBe(3)
    expect(body.meta.totalCount).toBe(45)
  })

  it('passes classification filter to repository', async () => {
    mockFindEmailsPaginated.mockResolvedValue({ emails: [], total: 0 } as never)

    await GET(new NextRequest('http://localhost/api/emails?classification=action'))

    expect(mockFindEmailsPaginated).toHaveBeenCalledWith('user-1', {
      page: 1,
      limit: 20,
      classification: 'action',
    })
  })

  it('defaults to page 1 and limit 20', async () => {
    mockFindEmailsPaginated.mockResolvedValue({ emails: [], total: 0 } as never)

    await GET(new NextRequest('http://localhost/api/emails'))

    expect(mockFindEmailsPaginated).toHaveBeenCalledWith('user-1', {
      page: 1,
      limit: 20,
      classification: undefined,
    })
  })
})
