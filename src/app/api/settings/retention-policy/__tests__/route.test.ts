import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

vi.mock('@/repositories/retention-repo', () => ({
  getRawPolicy: vi.fn(),
  updatePolicy: vi.fn(),
}))

import { getAuthUser } from '@/lib/api-helpers'
import * as retentionRepo from '@/repositories/retention-repo'
import { GET, POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockGetRawPolicy = vi.mocked(retentionRepo.getRawPolicy)
const mockUpdatePolicy = vi.mocked(retentionRepo.updatePolicy)

function postRequest(body: object): Request {
  return new Request('http://localhost/api/settings/retention-policy', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('api/settings/retention-policy route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns the current policy', async () => {
    mockGetRawPolicy.mockResolvedValue({ purgeAfterDays: 30 } as never)

    const res = await GET()

    expect(res.status).toBe(200)
    expect(mockGetRawPolicy).toHaveBeenCalledWith('user-1')
  })

  it('returns 400 when no valid fields are provided', async () => {
    const res = await POST(postRequest({ unknownField: 123 }))

    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe('No valid fields provided')
    expect(mockUpdatePolicy).not.toHaveBeenCalled()
  })

  it('returns 400 when a numeric field is invalid', async () => {
    const res = await POST(postRequest({ purgeAfterDays: -1 }))

    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe('purgeAfterDays must be a non-negative integer')
  })

  it('returns 400 when taskRetainAfterDays is outside the allowed options', async () => {
    const res = await POST(postRequest({ taskRetainAfterDays: 10 }))

    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe('taskRetainAfterDays must be one of 7, 14, 30, 60')
  })

  it('updates the policy with parsed values', async () => {
    mockUpdatePolicy.mockResolvedValue({ purgeAfterDays: 45, taskRetainAfterDays: 30 } as never)

    const res = await POST(postRequest({ purgeAfterDays: 45, taskRetainAfterDays: 30 }))

    expect(res.status).toBe(200)
    expect(mockUpdatePolicy).toHaveBeenCalledWith('user-1', {
      purgeAfterDays: 45,
      taskRetainAfterDays: 30,
    })
  })
})
