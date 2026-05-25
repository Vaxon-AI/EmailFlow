import { z } from 'zod'
import { defineRoute, error, parseJsonBody, success } from '@/lib/api-helpers'
import { verifyToken } from '@/lib/auth-token'
import { revokeSessionById } from '@/lib/auth-sessions'

const revokeDeviceSchema = z.object({
  token: z.string().min(1, 'Device limit token and session are required'),
  sessionId: z.string().min(1, 'Device limit token and session are required'),
})

export const POST = defineRoute(
  { tag: 'api/auth/device-limit/revoke', code: 'SYNC_FAILED', message: 'Failed to sign out device' },
  async (req: Request) => {
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
  },
)
