import { AppError } from '@/lib/app-errors'
import { defineRoute, error, success } from '@/lib/api-helpers'
import { hashPassword, verifyPassword } from '@/lib/auth-password'
import { hashResetToken } from '@/lib/password-reset'
import { findByTokenHashWithUser, applyResetPassword } from '@/repositories/password-reset-repo'

export const POST = defineRoute(
  { tag: 'api/auth/reset-password', code: 'SYNC_FAILED', message: 'Failed to reset password' },
  async (req: Request) => {
    const { token, newPassword, confirmPassword } = await req.json()

    if (!token || !newPassword || !confirmPassword) {
      return error('VALIDATION_ERROR', 'token, newPassword, and confirmPassword are required', 400)
    }

    if (newPassword !== confirmPassword) {
      return error('VALIDATION_ERROR', 'newPassword and confirmPassword do not match', 400)
    }

    if (newPassword.length < 8) {
      return error('VALIDATION_ERROR', 'newPassword must be at least 8 characters', 400)
    }

    const tokenHash = hashResetToken(token)
    const record = await findByTokenHashWithUser(tokenHash)

    // Normalize token state errors to avoid leaking information
    if (!record) {
      throw new AppError('VALIDATION_ERROR', 'Invalid reset link. Please request a new one.', 400)
    }

    if (record.usedAt || record.expiresAt < new Date()) {
      throw new AppError('LINK_EXPIRED', 'This reset link has expired. Please request a new one.', 400)
    }

    const user = record.user
    if (user.passwordHash) {
      const sameAsOld = await verifyPassword(newPassword, user.passwordHash)
      if (sameAsOld) {
        return error('VALIDATION_ERROR', 'newPassword must differ from the current password', 400)
      }
    }

    const newHash = await hashPassword(newPassword)

    await applyResetPassword({
      userId: user.id,
      passwordHash: newHash,
      tokenId: record.id,
    })

    return success({ message: 'Password has been reset successfully. You can now sign in.' })
  },
)
