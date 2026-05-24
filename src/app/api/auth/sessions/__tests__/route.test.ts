import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return { ...actual }
})

vi.mock('@/lib/auth-sessions', () => ({
  requireCurrentSessionContext: vi.fn(),
  listActiveSessions: vi.fn(),
}))

import { requireCurrentSessionContext } from '@/lib/auth-sessions'
import { listActiveSessions } from '@/lib/auth-sessions'
import { GET } from '../route'

const mockRequireContext = vi.mocked(requireCurrentSessionContext)
const mockListActiveSessions = vi.mocked(listActiveSessions)

describe('GET /api/auth/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireContext.mockResolvedValue({
      user: { id: 'user-1' },
      session: { id: 'session-current' },
    } as never)
  })

  it('returns sessions with isCurrent flag set on the active session', async () => {
    mockListActiveSessions.mockResolvedValue([
      { id: 'session-current', userAgent: 'Chrome' },
      { id: 'session-other', userAgent: 'Firefox' },
    ] as never)

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.sessions).toHaveLength(2)
    expect(body.data.sessions.find((s: { id: string }) => s.id === 'session-current').isCurrent).toBe(true)
    expect(body.data.sessions.find((s: { id: string }) => s.id === 'session-other').isCurrent).toBe(false)
  })

  it('returns empty sessions array when user has no active sessions', async () => {
    mockListActiveSessions.mockResolvedValue([] as never)

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.sessions).toEqual([])
  })
})
