import crypto from 'crypto'
import { getAuthUser, success, error, errorFromException } from '@/lib/api-helpers'
import { sendPasswordResetEmail } from '@/lib/mailer'
import { hashResetToken, getTokenTtlMs, RATE_LIMIT_SECONDS } from '@/lib/password-reset'
import { findByEmail, findById } from '@/repositories/user-repo'
import {
  findLatestForUser,
  invalidateAllActiveForUser,
  createResetToken,
} from '@/repositories/password-reset-repo'

export async function POST(req: Request) {
  try {
    // Support two modes:
    // 1. Authenticated (logged-in user from Settings) — no body needed
    // 2. Unauthenticated (forgot-password from login page) — pass { email } in body
    const sessionUser = await getAuthUser()

    let user: { id: string; email: string; passwordHash: string | null } | null = null

    if (sessionUser) {
      user = await findById(sessionUser.id)
    } else {
      // Try to find by email from body
      let email: string | undefined
      try {
        const body = await req.json()
        email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : undefined
      } catch {
        // no body / not JSON
      }
      if (!email) {
        return error('VALIDATION_ERROR', 'Email is required', 400)
      }
      user = await findByEmail(email)
    }

    // Always return success for unauthenticated requests to prevent email enumeration
    const genericOk = () => success({ message: 'If that email has an account, a reset link has been sent.' })

    if (!user) {
      // Don't reveal whether the email exists
      if (!sessionUser) return genericOk()
      return error('NOT_FOUND', 'User not found', 404)
    }

    if (!user.passwordHash) {
      if (!sessionUser) return genericOk()
      return error('VALIDATION_ERROR', 'This account uses OAuth sign-in and has no local password', 400)
    }

    // Rate limit: reject if a token was issued within the last RATE_LIMIT_SECONDS
    const latest = await findLatestForUser(user.id)
    if (latest) {
      const secondsSince = (Date.now() - latest.createdAt.getTime()) / 1000
      if (secondsSince < RATE_LIMIT_SECONDS) {
        const retryAfter = Math.ceil(RATE_LIMIT_SECONDS - secondsSince)
        return error('RATE_LIMITED', `Please wait ${retryAfter} second(s) before requesting another reset email`, 429)
      }
    }

    // Invalidate all active (unused, not yet expired) tokens for this user
    await invalidateAllActiveForUser(user.id)

    const plainToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashResetToken(plainToken)
    const expiresAt = new Date(Date.now() + getTokenTtlMs())

    await createResetToken({ userId: user.id, tokenHash, expiresAt })

    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const resetLink = `${appUrl}/reset-password?token=${plainToken}`

    await sendPasswordResetEmail(user.email, resetLink)

    return sessionUser
      ? success({ message: 'Password reset email sent. Check your inbox.' })
      : genericOk()
  } catch (err) {
    console.error('[api/auth/request-password-reset]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Failed to send reset email', 500)
  }
}
