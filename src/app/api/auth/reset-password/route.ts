import { NextResponse } from 'next/server'
import { AppError } from '@/lib/app-errors'
import { errorFromException } from '@/lib/api-helpers'
import { hashPassword, verifyPassword } from '@/lib/auth-password'
import { hashResetToken } from '@/lib/password-reset'
import { findByTokenHashWithUser, applyResetPassword } from '@/repositories/password-reset-repo'

export async function POST(req: Request) {
  try {
    const { token, newPassword, confirmPassword } = await req.json()

    if (!token || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { success: false, error: 'token, newPassword, and confirmPassword are required' },
        { status: 400 }
      )
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, error: 'newPassword and confirmPassword do not match' },
        { status: 400 }
      )
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: 'newPassword must be at least 8 characters' },
        { status: 400 }
      )
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
        return NextResponse.json(
          { success: false, error: 'newPassword must differ from the current password' },
          { status: 400 }
        )
      }
    }

    const newHash = await hashPassword(newPassword)

    await applyResetPassword({
      userId: user.id,
      passwordHash: newHash,
      tokenId: record.id,
    })

    return NextResponse.json({
      success: true,
      data: { message: 'Password has been reset successfully. You can now sign in.' },
    })
  } catch (err) {
    console.error('[api/auth/reset-password]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Failed to reset password', 500)
  }
}
