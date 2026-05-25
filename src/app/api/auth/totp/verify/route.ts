import { verify } from 'otplib'
import { z } from 'zod'
import { defineRoute, parseJsonBody, success } from '@/lib/api-helpers'

const verifyTotpSchema = z.object({
  token: z.string().min(1, 'Token and secret are required'),
  secret: z.string().min(1, 'Token and secret are required'),
})

export const POST = defineRoute(
  { tag: 'api/auth/totp/verify', code: 'SYNC_FAILED', message: 'Failed to verify code' },
  async (req: Request) => {
    const { token, secret } = await parseJsonBody(req, verifyTotpSchema, {
      code: 'VALIDATION_ERROR',
    })

    const result = await verify({ token, secret })

    return success({ isValid: result.valid })
  },
)
