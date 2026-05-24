import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

vi.mock('@/repositories/identity-repo', () => ({
  findAllForUser: vi.fn(),
  createSuggestion: vi.fn(),
}))

import { getAuthUser } from '@/lib/api-helpers'
import * as identityRepo from '@/repositories/identity-repo'
import { GET, POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockFindAllForUser = vi.mocked(identityRepo.findAllForUser)
const mockCreateSuggestion = vi.mocked(identityRepo.createSuggestion)

function postRequest(body: object) {
  return new Request('http://localhost/api/identities', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('api/identities route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns identities for the current user', async () => {
    mockFindAllForUser.mockResolvedValue([{ id: 'identity-1', name: 'Work' }] as never)

    const res = await GET()

    expect(res.status).toBe(200)
    expect(mockFindAllForUser).toHaveBeenCalledWith('user-1')
  })

  it('returns 400 when name is missing', async () => {
    const res = await POST(postRequest({ description: 'desc' }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Invalid input: expected string, received undefined',
      },
    })
    expect(mockCreateSuggestion).not.toHaveBeenCalled()
  })

  it('trims input before creating an identity suggestion', async () => {
    mockCreateSuggestion.mockResolvedValue({ id: 'identity-1', name: 'Work', description: 'desc' } as never)

    const res = await POST(postRequest({ name: '  Work  ', description: '  desc  ' }))

    expect(res.status).toBe(200)
    expect(mockCreateSuggestion).toHaveBeenCalledWith('user-1', {
      name: 'Work',
      description: 'desc',
    })
  })
})

