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

function isProductionEnvironment() {
  return process.env.NODE_ENV === 'production'
}

function getRememberMeCookieOptions() {
  return {
    maxAge: SESSION_MAX_AGE_REMEMBER_SECONDS,
    expires: new Date(Date.now() + SESSION_MAX_AGE_REMEMBER_SECONDS * 1000),
  }
}

function buildSessionCookieOptions(remember: boolean) {
  return {
    httpOnly: true,
    secure: isProductionEnvironment(),
    sameSite: 'lax' as const,
    ...(remember ? getRememberMeCookieOptions() : {}),
    path: '/',
  }
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
  cookieStore.set(COOKIE_NAME, token, buildSessionCookieOptions(remember))
}

export async function clearSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(COOKIE_NAME)?.value || null
}
