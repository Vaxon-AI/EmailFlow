import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/integrations', () => ({
  gmailProvider: {
    previewCount: vi.fn(),
  },
}))

vi.mock('@/lib/quota', () => ({
  getClassifyRemaining: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    account: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

import { gmailProvider } from '@/integrations'
import { getClassifyRemaining } from '@/lib/quota'
import { getAuthUser } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { GET } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockPreviewCount = vi.mocked(gmailProvider.previewCount)
const mockGetRemaining = vi.mocked(getClassifyRemaining)
const mockAccount = vi.mocked(prisma.account)

function getRequest(query: string): Request {
  return new Request(`http://localhost/api/sync/preview${query}`)
}

describe('GET /api/sync/preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
    mockAccount.findMany.mockResolvedValue([] as never)
    mockPreviewCount.mockResolvedValue({ quotaImpactCount: 42, capped: false })
    mockGetRemaining.mockResolvedValue(80)
  })

  it('returns preview for ?days=7 (default preset behavior)', async () => {
    const res = await GET(getRequest('?days=7'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.quotaImpactCount).toBe(42)
    expect(body.data.quotaRemaining).toBe(80)
    expect(body.data.wouldExceedQuota).toBe(false)
    expect(typeof body.data.since).toBe('string')
    expect(mockPreviewCount).toHaveBeenCalledOnce()
  })

  it('flags wouldExceedQuota when impact > remaining', async () => {
    mockPreviewCount.mockResolvedValue({ quotaImpactCount: 150, capped: false })
    mockGetRemaining.mockResolvedValue(80)

    const res = await GET(getRequest('?days=30'))
    const body = await res.json()
    expect(body.data.wouldExceedQuota).toBe(true)
  })

  it('forwards the capped flag from the provider for "500+" UI', async () => {
    mockPreviewCount.mockResolvedValue({ quotaImpactCount: 500, capped: true })

    const res = await GET(getRequest('?days=30'))
    const body = await res.json()
    expect(body.data.capped).toBe(true)
    expect(body.data.quotaImpactCount).toBe(500)
  })

  it('treats Infinity remaining (pro plan) as null and never exceeds', async () => {
    mockPreviewCount.mockResolvedValue({ quotaImpactCount: 1000, capped: false })
    mockGetRemaining.mockResolvedValue(Infinity)

    const res = await GET(getRequest('?days=30'))
    const body = await res.json()
    expect(body.data.quotaRemaining).toBeNull()
    expect(body.data.wouldExceedQuota).toBe(false)
  })

  it('accepts ?since=ISO_DATE for custom date pickers', async () => {
    const since = '2026-04-01T00:00:00.000Z'
    const res = await GET(getRequest(`?since=${encodeURIComponent(since)}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.since).toBe(since)
    expect(mockPreviewCount).toHaveBeenCalledWith('user-1', { since: new Date(since) })
  })

  it('rejects ?days outside [1, 365]', async () => {
    const res = await GET(getRequest('?days=400'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockPreviewCount).not.toHaveBeenCalled()
  })

  it('rejects ?days=0', async () => {
    const res = await GET(getRequest('?days=0'))
    expect(res.status).toBe(400)
    expect(mockPreviewCount).not.toHaveBeenCalled()
  })

  it('rejects future ?since dates', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    const res = await GET(getRequest(`?since=${encodeURIComponent(future)}`))
    expect(res.status).toBe(400)
    expect(mockPreviewCount).not.toHaveBeenCalled()
  })

  it('rejects invalid ?since value', async () => {
    const res = await GET(getRequest('?since=not-a-date'))
    expect(res.status).toBe(400)
    expect(mockPreviewCount).not.toHaveBeenCalled()
  })

  it('defaults days to 7 when no params are given', async () => {
    const res = await GET(getRequest(''))
    expect(res.status).toBe(200)
    expect(mockPreviewCount).toHaveBeenCalledOnce()
    const callArg = mockPreviewCount.mock.calls[0][1]
    const expected = Date.now() - 7 * 86_400_000
    expect(Math.abs(callArg.since.getTime() - expected)).toBeLessThan(2_000)
  })
})
