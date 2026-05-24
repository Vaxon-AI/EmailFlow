import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      update: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  clearProviderReauthRequired,
  markProviderReauthRequired,
} from '../provider-reauth'

const mockUser = vi.mocked(prisma.user)

describe('provider reauth helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUser.update.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('marks provider reauth as required with reason and provider', async () => {
    await markProviderReauthRequired('user-1', 'gmail', 'refresh_failed')

    expect(mockUser.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        emailProviderReauthRequired: true,
        emailProviderReauthReason: 'refresh_failed',
        emailProviderReauthAt: expect.any(Date),
        emailProviderReauthProvider: 'gmail',
      }),
    })
  })

  it('clears provider reauth flags while preserving the provider name', async () => {
    await clearProviderReauthRequired('user-1', 'outlook')

    expect(mockUser.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        emailProviderReauthRequired: false,
        emailProviderReauthReason: null,
        emailProviderReauthAt: null,
        emailProviderReauthProvider: 'outlook',
      },
    })
  })
})
