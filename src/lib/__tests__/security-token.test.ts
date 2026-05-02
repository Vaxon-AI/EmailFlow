import { describe, it, expect } from 'vitest'
import { createToken, verifyToken } from '../auth-token'

describe('JWT security: token tampering', () => {
  it('rejects a token with a tampered payload (original signature retained)', () => {
    const token = createToken({ userId: 'user-1' })
    const [header, , signature] = token.split('.')
    const forgedPayload = Buffer.from(
      JSON.stringify({ userId: 'admin', iat: Math.floor(Date.now() / 1000) })
    ).toString('base64url')
    const tampered = `${header}.${forgedPayload}.${signature}`
    expect(verifyToken(tampered)).toBeNull()
  })

  it('rejects a hybrid token whose payload was swapped with another user\'s', () => {
    const tokenA = createToken({ userId: 'user-a' })
    const tokenB = createToken({ userId: 'user-b' })
    const [headerA, , signatureA] = tokenA.split('.')
    const [, payloadB] = tokenB.split('.')
    const hybrid = `${headerA}.${payloadB}.${signatureA}`
    expect(verifyToken(hybrid)).toBeNull()
  })
})

describe('JWT security: algorithm confusion', () => {
  it('rejects JWT with "none" algorithm and empty signature', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(
      JSON.stringify({
        userId: 'user-1',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
      })
    ).toString('base64url')
    const noneToken = `${header}.${payload}.`
    expect(verifyToken(noneToken)).toBeNull()
  })

  it('rejects JWT with "none" algorithm and fabricated signature', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(
      JSON.stringify({ userId: 'user-1', iat: Math.floor(Date.now() / 1000) })
    ).toString('base64url')
    const noneToken = `${header}.${payload}.fakesig`
    expect(verifyToken(noneToken)).toBeNull()
  })
})
