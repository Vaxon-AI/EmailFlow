import crypto from 'crypto'
import { afterEach, describe, expect, it } from 'vitest'

import {
  RATE_LIMIT_SECONDS,
  getTokenTtlMs,
  hashResetToken,
} from '../password-reset'

describe('hashResetToken', () => {
  it('returns the sha256 hex digest of the token', () => {
    const token = 'plain-reset-token'
    const expected = crypto.createHash('sha256').update(token).digest('hex')
    expect(hashResetToken(token)).toBe(expected)
  })

  it('does not return the plaintext token', () => {
    expect(hashResetToken('secret-token')).not.toBe('secret-token')
  })
})

describe('getTokenTtlMs', () => {
  const originalTtl = process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES

  afterEach(() => {
    process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES = originalTtl
  })

  it('defaults to 60 minutes when env is unset', () => {
    delete process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES
    expect(getTokenTtlMs()).toBe(60 * 60 * 1000)
  })

  it('uses the configured positive integer minute value', () => {
    process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES = '15'
    expect(getTokenTtlMs()).toBe(15 * 60 * 1000)
  })

  it('falls back to 60 minutes for invalid or non-positive values', () => {
    process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES = '0'
    expect(getTokenTtlMs()).toBe(60 * 60 * 1000)

    process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES = '-5'
    expect(getTokenTtlMs()).toBe(60 * 60 * 1000)

    process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES = 'not-a-number'
    expect(getTokenTtlMs()).toBe(60 * 60 * 1000)
  })
})

describe('RATE_LIMIT_SECONDS', () => {
  it('stays at 60 seconds', () => {
    expect(RATE_LIMIT_SECONDS).toBe(60)
  })
})
