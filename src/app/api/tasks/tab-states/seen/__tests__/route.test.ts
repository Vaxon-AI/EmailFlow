import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

vi.mock('@/repositories/task-repo', () => ({
  TASK_TAB_BUCKETS: ['all', 'ai_suggestion', 'active', 'completed'],
  markTaskTabSeen: vi.fn(),
}))

import { getAuthUser } from '@/lib/api-helpers'
import { markTaskTabSeen } from '@/repositories/task-repo'
import { POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockMarkTaskTabSeen = vi.mocked(markTaskTabSeen)

function postRequest(body: object | string): Request {
  return new Request('http://localhost/api/tasks/tab-states/seen', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/tasks/tab-states/seen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
    mockMarkTaskTabSeen.mockResolvedValue({} as never)
  })

  it('returns ok when the user is not authenticated', async () => {
    mockGetAuthUser.mockResolvedValue(null as never)

    const res = await POST(postRequest({ bucket: 'active' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: { ok: true }, meta: undefined })
    expect(mockMarkTaskTabSeen).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid bucket', async () => {
    const res = await POST(postRequest({ bucket: 'archive' }))

    expect(res.status).toBe(400)
    expect(mockMarkTaskTabSeen).not.toHaveBeenCalled()
  })

  it('returns 400 for malformed JSON', async () => {
    const res = await POST(postRequest('{'))

    expect(res.status).toBe(400)
    expect(mockMarkTaskTabSeen).not.toHaveBeenCalled()
  })

  it('marks the bucket as seen', async () => {
    const res = await POST(postRequest({ bucket: 'active' }))

    expect(res.status).toBe(200)
    expect(mockMarkTaskTabSeen).toHaveBeenCalledWith('user-1', 'active')
  })
})
