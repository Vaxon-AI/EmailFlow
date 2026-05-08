import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/repositories/email-repo', () => ({
  countAwaitingReview: vi.fn(),
}))

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

import { countAwaitingReview } from '@/repositories/email-repo'
import { getAuthUser } from '@/lib/api-helpers'
import { GET } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockCountAwaitingReview = vi.mocked(countAwaitingReview)

describe('GET /api/emails/unclassified-count', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns the combined count from countAwaitingReview', async () => {
    mockCountAwaitingReview.mockResolvedValue(7)

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.count).toBe(7)
    expect(mockCountAwaitingReview).toHaveBeenCalledWith('user-1')
  })

  it('returns 0 when no emails are awaiting review', async () => {
    mockCountAwaitingReview.mockResolvedValue(0)

    const res = await GET()

    const body = await res.json()
    expect(body.data.count).toBe(0)
  })
})
