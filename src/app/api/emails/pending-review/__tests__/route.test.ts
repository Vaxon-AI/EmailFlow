import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/repositories/email-repo', () => ({
  findPendingReviewEmails: vi.fn(),
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
const mockFindPendingReviewEmails = vi.mocked(emailRepo.findPendingReviewEmails)

describe('GET /api/emails/pending-review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns pending review emails with count', async () => {
    mockFindPendingReviewEmails.mockResolvedValue([
      { id: 'email-1', subject: 'Review me' },
      { id: 'email-2', subject: 'Also me' },
    ] as never)

    const res = await GET()

    expect(mockFindPendingReviewEmails).toHaveBeenCalledWith('user-1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.emails).toHaveLength(2)
    expect(body.data.count).toBe(2)
  })

  it('returns empty list when no emails are pending review', async () => {
    mockFindPendingReviewEmails.mockResolvedValue([] as never)

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.emails).toEqual([])
    expect(body.data.count).toBe(0)
  })
})
