import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

vi.mock('@/lib/auth-sessions', () => ({
  requireCurrentUser: vi.fn(),
}))

import { requireCurrentUser } from '@/lib/auth-sessions'
import { AppError } from '@/lib/app-errors'
import {
  error,
  errorFromException,
  getAuthUser,
  parseJsonBody,
  requireCronAuth,
  success,
} from '../api-helpers'

const mockRequireCurrentUser = vi.mocked(requireCurrentUser)

describe('success', () => {
  it('returns a success payload with data and meta', async () => {
    const response = success({ ok: true }, { total: 1 })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { ok: true },
      meta: { total: 1 },
    })
  })
})

describe('error', () => {
  it('returns an error payload with the provided status', async () => {
    const response = error('BAD_REQUEST', 'Nope', 422)
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Nope' },
    })
  })
})

describe('getAuthUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates to requireCurrentUser', async () => {
    mockRequireCurrentUser.mockResolvedValue({ id: 'user-1' } as never)
    await expect(getAuthUser()).resolves.toEqual({ id: 'user-1' })
    expect(mockRequireCurrentUser).toHaveBeenCalledOnce()
  })
})

describe('parseJsonBody', () => {
  const schema = z.object({
    email: z.string().email(),
  })

  it('parses and validates a JSON request body', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com' }),
      headers: { 'content-type': 'application/json' },
    })

    await expect(parseJsonBody(req, schema)).resolves.toEqual({
      email: 'test@example.com',
    })
  })

  it('throws AppError when request JSON is invalid', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: '{not-json',
      headers: { 'content-type': 'application/json' },
    })

    await expect(parseJsonBody(req, schema)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Invalid request body',
      status: 400,
    })
  })

  it('throws AppError with the first zod issue message', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ email: 'not-an-email' }),
      headers: { 'content-type': 'application/json' },
    })

    await expect(parseJsonBody(req, schema)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Invalid email address',
      status: 400,
    })
  })

  it('respects custom AppError options', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: '{broken',
      headers: { 'content-type': 'application/json' },
    })

    await expect(parseJsonBody(req, schema, {
      code: 'INVALID_INPUT',
      message: 'Broken payload',
      status: 422,
    })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: 'Broken payload',
      status: 422,
    })
  })
})

describe('requireCronAuth', () => {
  const originalSecret = process.env.CRON_SECRET

  beforeEach(() => {
    process.env.CRON_SECRET = 'secret-123'
  })

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret
  })

  it('returns null when the bearer token matches', () => {
    const req = new Request('http://localhost', {
      headers: { authorization: 'Bearer secret-123' },
    })
    expect(requireCronAuth(req)).toBeNull()
  })

  it('returns unauthorized when the bearer token is missing or invalid', async () => {
    const req = new Request('http://localhost')
    const response = requireCronAuth(req)

    expect(response?.status).toBe(401)
    await expect(response?.json()).resolves.toEqual({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
    })
  })
})

describe('errorFromException', () => {
  it('uses AppError details when the exception is an AppError', async () => {
    const response = errorFromException(new AppError('SESSION_EXPIRED', 'Expired', 401))
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: { code: 'SESSION_EXPIRED', message: 'Expired' },
    })
  })

  it('falls back for unknown exceptions', async () => {
    const response = errorFromException(new Error('boom'), 'INTERNAL', 'Request failed', 500)
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: { code: 'INTERNAL', message: 'Request failed' },
    })
  })
})
