import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      update: vi.fn(),
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

import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/api-helpers'
import { POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockUser = vi.mocked(prisma.user)

function postRequest(body: object): Request {
  return new Request('http://localhost/api/settings/sync-range', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/settings/sync-range', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns 400 when both days and customDate are provided', async () => {
    const res = await POST(postRequest({ days: 7, customDate: '2026-05-01T00:00:00.000Z' }))

    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe('Provide either days or customDate, not both')
  })

  it('returns 400 when neither days nor customDate is provided', async () => {
    const res = await POST(postRequest({}))

    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe('Missing days or customDate')
  })

  it('returns 400 when days is invalid', async () => {
    const res = await POST(postRequest({ days: 0 }))

    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe('days must be an integer between 1 and 365')
    expect(mockUser.update).not.toHaveBeenCalled()
  })

  it('returns 400 when customDate is invalid or in the future', async () => {
    const invalid = await POST(postRequest({ customDate: 'not-a-date' }))
    expect(invalid.status).toBe(400)
    expect((await invalid.json()).error.message).toBe('customDate must be a valid ISO 8601 date')

    const futureDate = new Date(Date.now() + 86_400_000).toISOString()
    const future = await POST(postRequest({ customDate: futureDate }))
    expect(future.status).toBe(400)
    expect((await future.json()).error.message).toBe('customDate must be in the past')
  })

  it('updates syncStartDate from days', async () => {
    const before = Date.now()
    const res = await POST(postRequest({ days: 7 }))
    const after = Date.now()

    expect(res.status).toBe(200)
    expect(mockUser.update).toHaveBeenCalledTimes(1)
    const syncStartDate = mockUser.update.mock.calls[0]?.[0]?.data?.syncStartDate as Date
    expect(syncStartDate).toBeInstanceOf(Date)
    const ageMs = before - syncStartDate.getTime()
    const ageMsAfter = after - syncStartDate.getTime()
    expect(ageMs).toBeGreaterThanOrEqual(6 * 86_400_000)
    expect(ageMsAfter).toBeLessThanOrEqual(8 * 86_400_000)
  })

  it('updates syncStartDate from customDate', async () => {
    const customDate = '2026-05-01T00:00:00.000Z'
    const res = await POST(postRequest({ customDate }))

    expect(res.status).toBe(200)
    expect(mockUser.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { syncStartDate: new Date(customDate) },
    })
  })
})

