import { z } from 'zod'
import { errorFromException, success, parseJsonBody } from '@/lib/api-helpers'
import { requireCurrentUser } from '@/lib/auth-sessions'
import { setTotpSecret } from '@/repositories/user-repo'

const enableTotpSchema = z.object({
  secret: z.string().min(1, 'Missing secret'),
})

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser()

    const { secret } = await parseJsonBody(req, enableTotpSchema, {
      code: 'VALIDATION_ERROR',
    })

    await setTotpSecret(user.id, secret)

    return success(undefined)
  } catch (err) {
    console.error('[api/auth/totp/enable]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Failed to enable 2FA', 500)
  }
}
