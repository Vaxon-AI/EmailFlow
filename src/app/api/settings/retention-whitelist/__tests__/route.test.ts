import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

vi.mock('@/repositories/retention-repo', () => ({
  getProtectionRulesWithIds: vi.fn(),
  addProtectionRule: vi.fn(),
}))

import { getAuthUser } from '@/lib/api-helpers'
import * as retentionRepo from '@/repositories/retention-repo'
import { GET, POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockGetProtectionRulesWithIds = vi.mocked(retentionRepo.getProtectionRulesWithIds)
const mockAddProtectionRule = vi.mocked(retentionRepo.addProtectionRule)

function postRequest(body: object): Request {
  return new Request('http://localhost/api/settings/retention-whitelist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('api/settings/retention-whitelist route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns the existing whitelist rules', async () => {
    mockGetProtectionRulesWithIds.mockResolvedValue([{ id: 'rule-1', ruleType: 'DOMAIN', value: 'example.com' }] as never)

    const res = await GET()

    expect(res.status).toBe(200)
    expect(mockGetProtectionRulesWithIds).toHaveBeenCalledWith('user-1')
  })

  it('returns 400 for invalid ruleType', async () => {
    const res = await POST(postRequest({ ruleType: 'INVALID', value: 'example.com' }))

    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe('ruleType must be one of: CONTACT, DOMAIN, LABEL')
  })

  it('returns 400 for blank value', async () => {
    const res = await POST(postRequest({ ruleType: 'DOMAIN', value: '   ' }))

    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe('value is required and must be a non-empty string')
  })

  it('creates a new whitelist rule with trimmed value', async () => {
    mockAddProtectionRule.mockResolvedValue({ id: 'rule-1', ruleType: 'DOMAIN', value: 'example.com' } as never)

    const res = await POST(postRequest({ ruleType: 'DOMAIN', value: ' example.com ' }))

    expect(res.status).toBe(200)
    expect(mockAddProtectionRule).toHaveBeenCalledWith('user-1', 'DOMAIN', 'example.com')
  })

  it('returns 409 for duplicate rules', async () => {
    mockAddProtectionRule.mockRejectedValue(new Error('Unique constraint failed'))

    const res = await POST(postRequest({ ruleType: 'DOMAIN', value: 'example.com' }))

    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('DUPLICATE_RULE')
  })
})

