import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/repositories/task-repo', () => ({
  findTaskById: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}))

vi.mock('@/repositories/stats-repo', () => ({
  invalidateStatsCache: vi.fn(),
}))

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

import * as taskRepo from '@/repositories/task-repo'
import { invalidateStatsCache } from '@/repositories/stats-repo'
import { getAuthUser } from '@/lib/api-helpers'
import { GET, DELETE, PATCH } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockFindTaskById = vi.mocked(taskRepo.findTaskById)
const mockUpdateTask = vi.mocked(taskRepo.updateTask)
const mockDeleteTask = vi.mocked(taskRepo.deleteTask)
const mockInvalidateStatsCache = vi.mocked(invalidateStatsCache)

const STORED_TASK = {
  id: 'task-1',
  title: 'Review contract',
  status: 'pending',
  urgency: 3,
  impact: 4,
  priorityScore: 12,
}

describe('GET /api/tasks/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns the task when found', async () => {
    mockFindTaskById.mockResolvedValue(STORED_TASK as never)

    const res = await GET(new NextRequest('http://localhost'), {
      params: Promise.resolve({ id: 'task-1' }),
    })

    expect(mockFindTaskById).toHaveBeenCalledWith('user-1', 'task-1')
    expect(res.status).toBe(200)
    expect((await res.json()).data.id).toBe('task-1')
  })

  it('returns 404 when task does not exist', async () => {
    mockFindTaskById.mockResolvedValue(null)

    const res = await GET(new NextRequest('http://localhost'), {
      params: Promise.resolve({ id: 'missing' }),
    })

    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/tasks/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns 404 when task does not exist', async () => {
    mockFindTaskById.mockResolvedValue(null)

    const res = await DELETE(new NextRequest('http://localhost'), {
      params: Promise.resolve({ id: 'missing' }),
    })

    expect(res.status).toBe(404)
    expect(mockDeleteTask).not.toHaveBeenCalled()
  })

  it('deletes task, invalidates cache, and returns success', async () => {
    mockFindTaskById.mockResolvedValue(STORED_TASK as never)
    mockDeleteTask.mockResolvedValue(undefined as never)

    const res = await DELETE(new NextRequest('http://localhost'), {
      params: Promise.resolve({ id: 'task-1' }),
    })

    expect(mockDeleteTask).toHaveBeenCalledWith('task-1', 'user-1')
    expect(mockInvalidateStatsCache).toHaveBeenCalledWith('user-1')
    expect(res.status).toBe(200)
    expect((await res.json()).data.deleted).toBe(true)
  })
})

describe('PATCH /api/tasks/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
    mockFindTaskById.mockResolvedValue(STORED_TASK as never)
    mockUpdateTask.mockResolvedValue({ ...STORED_TASK } as never)
  })

  it('returns 404 when task does not exist', async () => {
    mockFindTaskById.mockResolvedValue(null)

    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'New title' }),
      headers: { 'content-type': 'application/json' },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: 'missing' }) })

    expect(res.status).toBe(404)
  })

  it('updates title and marks isUserEdited', async () => {
    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated title' }),
      headers: { 'content-type': 'application/json' },
    })

    await PATCH(req, { params: Promise.resolve({ id: 'task-1' }) })

    expect(mockUpdateTask).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ title: 'Updated title', isUserEdited: true })
    )
  })

  it('sets confirmedAt when status changes to confirmed', async () => {
    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'confirmed' }),
      headers: { 'content-type': 'application/json' },
    })

    await PATCH(req, { params: Promise.resolve({ id: 'task-1' }) })

    expect(mockUpdateTask).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        status: 'confirmed',
        confirmedAt: expect.any(Date),
        dismissedAt: null,
        completedAt: null,
      })
    )
    expect(mockInvalidateStatsCache).toHaveBeenCalledWith('user-1')
  })

  it('sets completedAt when status changes to completed', async () => {
    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed' }),
      headers: { 'content-type': 'application/json' },
    })

    await PATCH(req, { params: Promise.resolve({ id: 'task-1' }) })

    expect(mockUpdateTask).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ status: 'completed', completedAt: expect.any(Date) })
    )
  })

  it('clears all timestamps when status changes to pending', async () => {
    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'pending' }),
      headers: { 'content-type': 'application/json' },
    })

    await PATCH(req, { params: Promise.resolve({ id: 'task-1' }) })

    expect(mockUpdateTask).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        status: 'pending',
        confirmedAt: null,
        dismissedAt: null,
        completedAt: null,
      })
    )
  })

  it('recalculates priorityScore when urgency or impact changes', async () => {
    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ urgency: 5, impact: 4 }),
      headers: { 'content-type': 'application/json' },
    })

    await PATCH(req, { params: Promise.resolve({ id: 'task-1' }) })

    expect(mockUpdateTask).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ urgency: 5, impact: 4, priorityScore: 20 })
    )
  })

  it('does not invalidate stats cache when status is not updated', async () => {
    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'New title' }),
      headers: { 'content-type': 'application/json' },
    })

    await PATCH(req, { params: Promise.resolve({ id: 'task-1' }) })

    expect(mockInvalidateStatsCache).not.toHaveBeenCalled()
  })
})
