import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    stepUpChallenge: {
      updateMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    stepUpToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/mailer', () => ({
  sendStepUpOtpEmail: vi.fn(),
}))

vi.mock('otplib', () => ({
  verify: vi.fn(),
}))

import { AppError } from '../app-errors'
import { prisma } from '@/lib/prisma'
import { sendStepUpOtpEmail } from '@/lib/mailer'
import { verify as verifyOtp } from 'otplib'
import {
  consumeStepUpToken,
  requestStepUp,
  verifyStepUp,
} from '../step-up-auth'

const mockUser = vi.mocked(prisma.user)
const mockStepUpChallenge = vi.mocked(prisma.stepUpChallenge)
const mockStepUpToken = vi.mocked(prisma.stepUpToken)
const mockSendStepUpOtpEmail = vi.mocked(sendStepUpOtpEmail)
const mockVerifyOtp = vi.mocked(verifyOtp)

describe('requestStepUp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStepUpChallenge.updateMany.mockResolvedValue({ count: 0 } as never)
    mockStepUpChallenge.create.mockResolvedValue({ id: 'challenge-1' } as never)
    mockSendStepUpOtpEmail.mockResolvedValue(undefined as never)
  })

  it('returns totp when the user has TOTP enabled', async () => {
    mockUser.findUnique.mockResolvedValue({ email: 'alice@example.com', totpEnabled: true } as never)

    await expect(requestStepUp('user-1', 'change_password')).resolves.toEqual({ method: 'totp' })
    expect(mockStepUpChallenge.updateMany).not.toHaveBeenCalled()
    expect(mockSendStepUpOtpEmail).not.toHaveBeenCalled()
  })

  it('invalidates old challenges, creates a new challenge, and emails an OTP when using email verification', async () => {
    mockUser.findUnique.mockResolvedValue({ email: 'alice@example.com', totpEnabled: false } as never)

    await expect(requestStepUp('user-1', 'disable_totp')).resolves.toEqual({ method: 'email' })

    expect(mockStepUpChallenge.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', action: 'disable_totp', usedAt: null },
      data: { usedAt: expect.any(Date) },
    })
    expect(mockStepUpChallenge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        action: 'disable_totp',
        otpHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
      }),
    })
    expect(mockSendStepUpOtpEmail).toHaveBeenCalledWith({
      to: 'alice@example.com',
      otp: expect.stringMatching(/^\d{6}$/),
      action: 'disable_totp',
    })
  })

  it('throws EMAIL_SEND_FAILED when sending the OTP email fails', async () => {
    mockUser.findUnique.mockResolvedValue({ email: 'alice@example.com', totpEnabled: false } as never)
    mockSendStepUpOtpEmail.mockRejectedValue(new Error('smtp down'))

    await expect(requestStepUp('user-1', 'change_password')).rejects.toMatchObject({
      code: 'EMAIL_SEND_FAILED',
      status: 502,
    })
  })
})

describe('verifyStepUp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStepUpToken.create.mockResolvedValue({ id: 'token-1' } as never)
  })

  it('verifies a TOTP code and creates a step-up token', async () => {
    mockUser.findUnique.mockResolvedValue({ totpEnabled: true, totpSecret: 'secret' } as never)
    mockVerifyOtp.mockResolvedValue({ valid: true } as never)

    const token = await verifyStepUp('user-1', '123456', 'change_password')

    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
    expect(mockVerifyOtp).toHaveBeenCalledWith({ token: '123456', secret: 'secret' })
    expect(mockStepUpToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        action: 'change_password',
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
      }),
    })
  })

  it('throws when TOTP is enabled but not configured', async () => {
    mockUser.findUnique.mockResolvedValue({ totpEnabled: true, totpSecret: null } as never)

    await expect(verifyStepUp('user-1', '123456', 'change_password')).rejects.toThrow('TOTP not configured')
  })

  it('throws when the TOTP code is invalid', async () => {
    mockUser.findUnique.mockResolvedValue({ totpEnabled: true, totpSecret: 'secret' } as never)
    mockVerifyOtp.mockResolvedValue({ valid: false } as never)

    await expect(verifyStepUp('user-1', '123456', 'change_password')).rejects.toThrow('Invalid authenticator code')
  })

  it('rejects an invalid email OTP code', async () => {
    mockUser.findUnique.mockResolvedValue({ totpEnabled: false, totpSecret: null } as never)
    mockStepUpChallenge.findFirst.mockResolvedValue(null)

    await expect(verifyStepUp('user-1', '999999', 'disable_totp')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 401,
    })
  })

  it('rejects an expired email OTP challenge', async () => {
    mockUser.findUnique.mockResolvedValue({ totpEnabled: false, totpSecret: null } as never)
    mockStepUpChallenge.findFirst.mockResolvedValue({
      id: 'challenge-1',
      expiresAt: new Date(Date.now() - 1000),
    } as never)

    await expect(verifyStepUp('user-1', '999999', 'disable_totp')).rejects.toMatchObject({
      code: 'CODE_EXPIRED',
      status: 401,
    })
  })

  it('marks the challenge used and creates a step-up token for a valid email OTP', async () => {
    mockUser.findUnique.mockResolvedValue({ totpEnabled: false, totpSecret: null } as never)
    mockStepUpChallenge.findFirst.mockResolvedValue({
      id: 'challenge-1',
      expiresAt: new Date(Date.now() + 60_000),
    } as never)
    mockStepUpChallenge.update.mockResolvedValue({} as never)

    await verifyStepUp('user-1', '999999', 'disable_totp')

    expect(mockStepUpChallenge.update).toHaveBeenCalledWith({
      where: { id: 'challenge-1' },
      data: { usedAt: expect.any(Date) },
    })
    expect(mockStepUpToken.create).toHaveBeenCalled()
  })
})

describe('consumeStepUpToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStepUpToken.update.mockResolvedValue({} as never)
  })

  it('rejects a missing token record', async () => {
    mockStepUpToken.findUnique.mockResolvedValue(null)

    await expect(consumeStepUpToken('user-1', 'raw-token', 'change_password')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 403,
    })
  })

  it('rejects a token for the wrong user or action', async () => {
    mockStepUpToken.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'other-user',
      action: 'change_password',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    } as never)

    await expect(consumeStepUpToken('user-1', 'raw-token', 'change_password')).rejects.toBeInstanceOf(AppError)
  })

  it('rejects a token that has already been used', async () => {
    mockStepUpToken.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      action: 'change_password',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
    } as never)

    await expect(consumeStepUpToken('user-1', 'raw-token', 'change_password')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 403,
    })
  })

  it('rejects an expired token', async () => {
    mockStepUpToken.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      action: 'change_password',
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
    } as never)

    await expect(consumeStepUpToken('user-1', 'raw-token', 'change_password')).rejects.toMatchObject({
      code: 'CODE_EXPIRED',
      status: 403,
    })
  })

  it('marks a valid token as used', async () => {
    mockStepUpToken.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      action: 'change_password',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    } as never)

    await expect(consumeStepUpToken('user-1', 'raw-token', 'change_password')).resolves.toBeUndefined()
    expect(mockStepUpToken.update).toHaveBeenCalledWith({
      where: { id: 'token-1' },
      data: { usedAt: expect.any(Date) },
    })
  })
})
