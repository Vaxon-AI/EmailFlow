/**
 * Step-Up Authentication
 *
 * Guards sensitive operations (change password, disable TOTP, delete account)
 * behind a secondary verification step. Two methods are supported:
 *
 *  - 'totp'  — user has 2FA enabled; they provide their current TOTP code
 *  - 'email' — user has no TOTP; a 6-digit OTP is emailed and must be confirmed
 *
 * Flow:
 *  1. Client calls requestStepUp(userId, action)
 *     → returns { method: 'totp' | 'email' }
 *     → for 'email': sends OTP email and creates a StepUpChallenge record
 *
 *  2. Client calls verifyStepUp(userId, code, action)
 *     → for 'totp': verifies the TOTP code against the user's secret
 *     → for 'email': verifies OTP against the StepUpChallenge record
 *     → on success: creates a short-lived StepUpToken and returns the raw token
 *
 *  3. Client includes the raw token in the sensitive endpoint request body as `stepUpToken`
 *
 *  4. The sensitive endpoint calls consumeStepUpToken(userId, rawToken, action)
 *     → verifies: correct user, correct action, not expired, not already used
 *     → marks token as used and returns true
 */

import crypto from 'node:crypto'
import { AppError } from '@/lib/app-errors'
import { prisma } from '@/lib/prisma'
import { sendStepUpOtpEmail } from '@/lib/mailer'
import { verify } from 'otplib'

export type StepUpAction = 'change_password' | 'disable_totp' | 'delete_account' | 'run_cleanup'

const OTP_TTL_MS = 10 * 60 * 1000  // 10 minutes
const STEP_UP_TOKEN_TTL_MS = 5 * 60 * 1000  // 5 minutes

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function generateOtp(): string {
  // Cryptographically random 6-digit code
  const buf = crypto.randomBytes(3)
  const num = (buf.readUIntBE(0, 3) % 1_000_000).toString().padStart(6, '0')
  return num
}

function generateRawToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function expiresAtFrom(now: Date, ttlMs: number) {
  return new Date(now.getTime() + ttlMs)
}

async function invalidateExistingChallenges(userId: string, action: StepUpAction) {
  await prisma.stepUpChallenge.updateMany({
    where: { userId, action, usedAt: null },
    data: { usedAt: new Date() },
  })
}

async function assertValidEmailChallenge(
  userId: string,
  code: string,
  action: StepUpAction,
) {
  const now = new Date()
  const challenge = await prisma.stepUpChallenge.findFirst({
    where: {
      userId,
      action,
      otpHash: sha256(code),
      usedAt: null,
    },
  })

  if (!challenge) {
    throw new AppError('VALIDATION_ERROR', 'Invalid verification code.', 401)
  }

  if (challenge.expiresAt <= now) {
    throw new AppError('CODE_EXPIRED', 'Your verification code has expired. Please request a new one.', 401)
  }

  return { challenge, now }
}

function assertConsumableStepUpToken(
  token: {
    id: string
    userId: string
    action: string
    expiresAt: Date
    usedAt: Date | null
  } | null,
  userId: string,
  action: StepUpAction,
  now: Date,
) {
  if (!token || token.userId !== userId || token.action !== action) {
    throw new AppError('VALIDATION_ERROR', 'Invalid step-up verification. Please verify again.', 403)
  }

  if (token.usedAt !== null) {
    throw new AppError('VALIDATION_ERROR', 'This verification has already been used. Please verify again.', 403)
  }

  if (token.expiresAt <= now) {
    throw new AppError('CODE_EXPIRED', 'Your verification has expired. Please verify again.', 403)
  }
}

async function issueStepUpToken(userId: string, action: StepUpAction): Promise<string> {
  const rawToken = generateRawToken()
  const now = new Date()

  await prisma.stepUpToken.create({
    data: {
      userId,
      tokenHash: sha256(rawToken),
      action,
      expiresAt: expiresAtFrom(now, STEP_UP_TOKEN_TTL_MS),
    },
  })

  return rawToken
}

/**
 * Determines which verification method the user should use and, for the 'email'
 * method, sends the OTP and stores the challenge.
 */
export async function requestStepUp(
  userId: string,
  action: StepUpAction,
): Promise<{ method: 'totp' | 'email' }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, totpEnabled: true },
  })

  if (!user) throw new Error('User not found')

  if (user.totpEnabled) {
    return { method: 'totp' }
  }

  // Email OTP path — invalidate any existing challenges for this action first
  await invalidateExistingChallenges(userId, action)

  const otp = generateOtp()
  const now = new Date()

  await prisma.stepUpChallenge.create({
    data: {
      userId,
      otpHash: sha256(otp),
      action,
      expiresAt: expiresAtFrom(now, OTP_TTL_MS),
    },
  })

  try {
    await sendStepUpOtpEmail({ to: user.email, otp, action })
  } catch (err) {
    // Surface a clear, actionable message instead of a generic 500.
    // The underlying error is logged by the calling route.
    console.error('[step-up] failed to send OTP email', err)
    throw new AppError(
      'EMAIL_SEND_FAILED',
      'Could not send the verification email. Please try again later.',
      502,
    )
  }

  return { method: 'email' }
}

/**
 * Verifies the code submitted by the user and, on success, issues a short-lived
 * StepUpToken that authorises the actual operation.
 *
 * Returns the raw step-up token string on success, or throws on failure.
 */
export async function verifyStepUp(
  userId: string,
  code: string,
  action: StepUpAction,
): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpEnabled: true, totpSecret: true },
  })

  if (!user) throw new Error('User not found')

  if (user.totpEnabled) {
    // TOTP path
    if (!user.totpSecret) throw new Error('TOTP not configured')

    const result = await verify({ token: String(code), secret: user.totpSecret })
    if (!result.valid) throw new Error('Invalid authenticator code')
  } else {
    // Email OTP path
    const { challenge, now } = await assertValidEmailChallenge(userId, code, action)

    // Mark OTP challenge as used
    await prisma.stepUpChallenge.update({
      where: { id: challenge.id },
      data: { usedAt: now },
    })
  }

  return issueStepUpToken(userId, action)
}

/**
 * Validates and consumes a step-up token for a specific action.
 * Returns true if the token was valid and has now been marked used.
 * Returns false if invalid, expired, already used, or wrong action.
 */
export async function consumeStepUpToken(
  userId: string,
  rawToken: string,
  action: StepUpAction,
): Promise<void> {
  const now = new Date()
  const hash = sha256(rawToken)

  const token = await prisma.stepUpToken.findUnique({
    where: { tokenHash: hash },
    select: { id: true, userId: true, action: true, expiresAt: true, usedAt: true },
  })

  assertConsumableStepUpToken(token, userId, action, now)
  const consumableToken = token!

  await prisma.stepUpToken.update({
    where: { id: consumableToken.id },
    data: { usedAt: now },
  })
}
