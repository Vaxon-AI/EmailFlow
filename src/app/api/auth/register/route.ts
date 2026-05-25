import { NextResponse } from 'next/server'
import { z } from 'zod'
import { findByEmail, createUser } from '@/repositories/user-repo'
import { hashPassword } from '@/lib/auth-password'
import { setSessionCookie } from '@/lib/auth-token'
import { createUserSession } from '@/lib/auth-sessions'
import { deviceLimitErrorResponse } from '@/lib/auth-api'
import { getInheritedQuotaForEmail } from '@/repositories/quota-ledger-repo'
import { success, error, errorFromException, parseJsonBody } from '@/lib/api-helpers'

const registerSchema = z.object({
  email: z.string().min(1, 'Email and password are required'),
  password: z.string().min(1, 'Email and password are required'),
  name: z.string().optional(),
})

export async function POST(req: Request) {
  try {
    const { email, password, name } = await parseJsonBody(req, registerSchema, {
      code: 'VALIDATION_ERROR',
      message: 'Email and password are required',
      status: 400,
    })

    if (password.length < 8) {
      return error('VALIDATION_ERROR', 'Password must be at least 8 characters', 400)
    }

    const existing = await findByEmail(email)
    if (existing) {
      return error('EMAIL_EXISTS', 'An account with this email already exists', 409)
    }

    const passwordHash = await hashPassword(password)
    const inherited = await getInheritedQuotaForEmail(email, 'email')
    const user = await createUser({
      email,
      name: name || email.split('@')[0],
      passwordHash,
      classifyUsed: inherited.classifyUsed,
      extractUsed: inherited.extractUsed,
      pasteTextUsed: inherited.pasteTextUsed,
      quotaResetAt: inherited.quotaResetAt,
    })

    const { rawToken } = await createUserSession({
      userId: user.id,
      userEmail: user.email,
      remember: true,
      request: req,
      sendNewDeviceAlert: false,
    })
    await setSessionCookie(rawToken, true)

    return success({ id: user.id, email: user.email, name: user.name })
  } catch (err) {
    const deviceLimitResponse = deviceLimitErrorResponse(err)
    if (deviceLimitResponse) return deviceLimitResponse
    console.error('[api/auth/register]', err)
    return errorFromException(err, 'REGISTER_FAILED', 'Registration failed', 500)
  }
}
