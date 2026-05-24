import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

vi.mock('@/repositories/retention-repo', () => ({
  removeProtectionRule: vi.fn(),
}))

import { getAuthUser } from '@/lib/api-helpers'
import * as retentionRepo from '@/repositories/retention-repo'
import { DELETE } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockRemoveProtectionRule = vi.mocked(retentionRepo.removeProtectionRule)

describe('DELETE /api/settings/retention-whitelist/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns 404 when the rule does not exist', async () => {
    mockRemoveProtectionRule.mockResolvedValue({ count: 0 } as never)

    const res = await DELETE(new Request('http://localhost/api/settings/retention-whitelist/rule-1'), {
      params: Promise.resolve({ id: 'rule-1' }),
    })

    expect(res.status).toBe(404)
    expect((await res.json()).error.message).toBe('Rule not found')
  })

  it('deletes the rule for the current user', async () => {
    mockRemoveProtectionRule.mockResolvedValue({ count: 1 } as never)

    const res = await DELETE(new Request('http://localhost/api/settings/retention-whitelist/rule-1'), {
      params: Promise.resolve({ id: 'rule-1' }),
    })

    expect(res.status).toBe(200)
    expect(mockRemoveProtectionRule).toHaveBeenCalledWith('user-1', 'rule-1')
    expect(await res.json()).toEqual({ success: true, data: { deleted: true } })
  })
})

