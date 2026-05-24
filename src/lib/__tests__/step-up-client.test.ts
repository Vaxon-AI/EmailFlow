import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  requestStepUp,
  verifyStepUp,
} from '../step-up-client'

const mockFetch = vi.fn()

describe('step-up-client', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = mockFetch as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('requests step-up verification and returns the method', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ success: true, data: { method: 'email' } }),
    })

    await expect(requestStepUp('change_password')).resolves.toEqual({ method: 'email' })
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/step-up/request', expect.objectContaining({
      method: 'POST',
    }))
  })

  it('throws a message from an object-shaped API error when requesting step-up', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ success: false, error: { message: 'Start failed' } }),
    })

    await expect(requestStepUp('disable_totp')).rejects.toThrow('Start failed')
  })

  it('falls back to the API error code when the error object has no message', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ success: false, error: { code: 'VALIDATION_ERROR' } }),
    })

    await expect(requestStepUp('delete_account')).rejects.toThrow('VALIDATION_ERROR')
  })

  it('requests step-up verification confirmation and returns the token', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ success: true, data: { stepUpToken: 'token-123' } }),
    })

    await expect(verifyStepUp('change_password', '123456')).resolves.toBe('token-123')
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/step-up/verify', expect.objectContaining({
      method: 'POST',
    }))
  })

  it('throws a plain string API error when verification fails', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ success: false, error: 'Bad code' }),
    })

    await expect(verifyStepUp('run_cleanup', '000000')).rejects.toThrow('Bad code')
  })

  it('falls back to the default message for unknown API error shapes', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ success: false, error: null }),
    })

    await expect(verifyStepUp('run_cleanup', '000000')).rejects.toThrow('Verification failed')
  })
})
