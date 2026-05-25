import { z } from 'zod'
import { defineRoute, parseJsonBody, success } from '@/lib/api-helpers'
import { requireCurrentUser } from '@/lib/auth-sessions'
import { setTotpSecret } from '@/repositories/user-repo'

const enableTotpSchema = z.object({
  secret: z.string().min(1, 'Missing secret'),
})

export const POST = defineRoute(
  { tag: 'api/auth/totp/enable', code: 'SYNC_FAILED', message: 'Failed to enable 2FA' },
  async (req: Request) => {
    const user = await requireCurrentUser()

    const { secret } = await parseJsonBody(req, enableTotpSchema, {
      code: 'VALIDATION_ERROR',
    })

    await setTotpSecret(user.id, secret)

    return success(undefined)
  },
)
