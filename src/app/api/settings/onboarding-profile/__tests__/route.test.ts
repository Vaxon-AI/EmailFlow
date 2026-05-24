import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

vi.mock('@/repositories/user-preference-repo', () => ({
  findByUserId: vi.fn(),
  upsert: vi.fn(),
}))

import { getAuthUser } from '@/lib/api-helpers'
import * as userPreferenceRepo from '@/repositories/user-preference-repo'
import { GET, POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockFindByUserId = vi.mocked(userPreferenceRepo.findByUserId)
const mockUpsert = vi.mocked(userPreferenceRepo.upsert)

function postRequest(body: object): Request {
  return new Request('http://localhost/api/settings/onboarding-profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('api/settings/onboarding-profile route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns null when no stored profile exists', async () => {
    mockFindByUserId.mockResolvedValue(null)

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: null })
  })

  it('returns 400 when a field is not an array', async () => {
    const res = await POST(postRequest({ role: 'Student' }))

    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe('role must be an array')
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns 400 when a field exceeds its limit', async () => {
    const res = await POST(postRequest({ purpose: ['Work', 'Study', 'Research'] }))

    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe('purpose accepts at most 2 item(s)')
  })

  it('returns 400 when a field contains an unknown value', async () => {
    const res = await POST(postRequest({ focusAreas: ['Deadlines', 'Unknown'] }))

    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe('focusAreas contains an unknown value: Unknown')
  })

  it('deduplicates and stores sanitized selections', async () => {
    mockUpsert.mockResolvedValue({
      roles: ['Student'],
      purposes: ['Work'],
      focusAreas: ['Deadlines'],
      updatedAt: new Date('2026-05-24T10:00:00.000Z'),
    } as never)

    const res = await POST(postRequest({
      role: ['Student', 'Student'],
      purpose: ['Work'],
      focusAreas: ['Deadlines', 'Deadlines'],
    }))

    expect(res.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalledWith('user-1', {
      roles: ['Student'],
      purposes: ['Work'],
      focusAreas: ['Deadlines'],
    })
  })
})

