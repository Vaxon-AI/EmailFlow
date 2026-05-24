import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

vi.mock('@/repositories/identity-repo', () => ({
  findById: vi.fn(),
  confirmIdentity: vi.fn(),
}))

import { getAuthUser } from '@/lib/api-helpers'
import * as identityRepo from '@/repositories/identity-repo'
import { PATCH } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockFindById = vi.mocked(identityRepo.findById)
const mockConfirmIdentity = vi.mocked(identityRepo.confirmIdentity)

function patchRequest(body: object) {
  return new NextRequest('http://localhost/api/identities/identity-1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/identities/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns 400 when name is missing', async () => {
    const res = await PATCH(patchRequest({}), { params: Promise.resolve({ id: 'identity-1' }) })

    expect(res.status).toBe(400)
    expect(mockFindById).not.toHaveBeenCalled()
  })

  it('returns 404 when identity is missing or belongs to another user', async () => {
    mockFindById.mockResolvedValue({ id: 'identity-1', userId: 'user-2' } as never)

    const res = await PATCH(
      patchRequest({ name: 'Renamed' }),
      { params: Promise.resolve({ id: 'identity-1' }) },
    )

    expect(res.status).toBe(404)
    expect(mockConfirmIdentity).not.toHaveBeenCalled()
  })

  it('renames the identity with trimmed input', async () => {
    mockFindById.mockResolvedValue({ id: 'identity-1', userId: 'user-1' } as never)
    mockConfirmIdentity.mockResolvedValue({ id: 'identity-1', name: 'Renamed' } as never)

    const res = await PATCH(
      patchRequest({ name: '  Renamed  ' }),
      { params: Promise.resolve({ id: 'identity-1' }) },
    )

    expect(res.status).toBe(200)
    expect(mockConfirmIdentity).toHaveBeenCalledWith('identity-1', { name: 'Renamed' })
  })
})
