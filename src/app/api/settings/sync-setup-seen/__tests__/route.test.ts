import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      update: vi.fn(),
    },
  },
}))

import { getAuthUser } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockUser = vi.mocked(prisma.user)

describe('POST /api/settings/sync-setup-seen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('marks the current user as having seen sync setup', async () => {
    const res = await POST()

    expect(res.status).toBe(200)
    expect(mockUser.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { hasSeenSyncSetup: true },
    })
    expect(await res.json()).toEqual({
      success: true,
      data: { hasSeenSyncSetup: true },
    })
  })
})
