import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'
export const COOKIE_NAME = 'ef-session'
export const SESSION_MAX_AGE_REMEMBER_SECONDS = 30 * 24 * 60 * 60
export const SESSION_MAX_AGE_DEFAULT_SECONDS = 24 * 60 * 60

export interface TokenPayload {
  userId: string
  purpose?: 'pre-2fa' | 'device-limit'
  remember?: boolean
}

export function createToken(payload: TokenPayload, expiresInSeconds = 10 * 60): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: expiresInSeconds,
  })
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload
  } catch {
    return null
  }
}

export async function setSessionCookie(token: string, remember = false) {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    ...(remember ? { maxAge: SESSION_MAX_AGE_REMEMBER_SECONDS } : {}),
    path: '/',
  })
}

export async function clearSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(COOKIE_NAME)?.value || null
}
