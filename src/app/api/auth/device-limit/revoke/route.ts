import { z } from 'zod'
import { success, error, errorFromException, parseJsonBody } from '@/lib/api-helpers'
import { verifyToken } from '@/lib/auth-token'
import { revokeSessionById } from '@/lib/auth-sessions'

const revokeDeviceSchema = z.object({
  token: z.string().min(1, 'Device limit token and session are required'),
  sessionId: z.string().min(1, 'Device limit token and session are required'),
})

export async function POST(req: Request) {
  try {
    const { token, sessionId } = await parseJsonBody(req, revokeDeviceSchema, {
      code: 'VALIDATION_ERROR',
    })

    const payload = verifyToken(token)
    if (!payload || payload.purpose !== 'device-limit') {
      return error('INVALID_TOKEN', 'Invalid or expired device limit token', 401)
    }

    const revoked = await revokeSessionById(sessionId, payload.userId)
    if (!revoked) {
      return error('NOT_FOUND', 'Device not found', 404)
    }

    return success(undefined)
  } catch (err) {
    console.error('[api/auth/device-limit/revoke]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Failed to sign out device', 500)
  }
}
