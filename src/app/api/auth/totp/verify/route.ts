import { verify } from 'otplib'
import { z } from 'zod'
import { success, errorFromException, parseJsonBody } from '@/lib/api-helpers'

const verifyTotpSchema = z.object({
  token: z.string().min(1, 'Token and secret are required'),
  secret: z.string().min(1, 'Token and secret are required'),
})

export async function POST(req: Request) {
  try {
    const { token, secret } = await parseJsonBody(req, verifyTotpSchema, {
      code: 'VALIDATION_ERROR',
    })

    const result = await verify({ token, secret })

    return success({ isValid: result.valid })
  } catch (err) {
    console.error('[api/auth/totp/verify]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Failed to verify code', 500)
  }
}