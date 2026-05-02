import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '../auth-password'

describe('hashPassword', () => {
  it('returns a bcrypt hash string', async () => {
    const hash = await hashPassword('secret')
    expect(hash).toMatch(/^\$2[ab]\$\d+\$/)
  })

  it('does not return the plaintext password', async () => {
    const hash = await hashPassword('secret')
    expect(hash).not.toBe('secret')
  })

  it('produces different hashes for the same input (random salt)', async () => {
    const h1 = await hashPassword('secret')
    const h2 = await hashPassword('secret')
    expect(h1).not.toBe(h2)
  })
})

describe('verifyPassword', () => {
  it('returns true for the correct password', async () => {
    const hash = await hashPassword('correct-password')
    expect(await verifyPassword('correct-password', hash)).toBe(true)
  })

  it('returns false for an incorrect password', async () => {
    const hash = await hashPassword('correct-password')
    expect(await verifyPassword('wrong-password', hash)).toBe(false)
  })

  it('returns false for an empty password against a non-empty hash', async () => {
    const hash = await hashPassword('nonempty')
    expect(await verifyPassword('', hash)).toBe(false)
  })
})
