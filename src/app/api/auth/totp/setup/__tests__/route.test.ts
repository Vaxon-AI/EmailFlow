import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('otplib', () => ({
  generateSecret: vi.fn(),
  generateURI: vi.fn(),
}))

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(),
  },
}))

import { generateSecret, generateURI } from 'otplib'
import QRCode from 'qrcode'
import { POST } from '../route'

const mockGenerateSecret = vi.mocked(generateSecret)
const mockGenerateURI = vi.mocked(generateURI)
const mockToDataURL = vi.mocked(QRCode.toDataURL)

describe('POST /api/auth/totp/setup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns secret and QR code data URL', async () => {
    mockGenerateSecret.mockReturnValue('JBSWY3DPEHPK3PXP' as never)
    mockGenerateURI.mockReturnValue('otpauth://totp/...' as never)
    mockToDataURL.mockResolvedValue('data:image/png;base64,abc' as never)

    const res = await POST()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.secret).toBe('JBSWY3DPEHPK3PXP')
    expect(body.data.qrCodeDataUrl).toBe('data:image/png;base64,abc')
  })

  it('generates URI with correct issuer and label', async () => {
    mockGenerateSecret.mockReturnValue('SECRET123' as never)
    mockGenerateURI.mockReturnValue('otpauth://...' as never)
    mockToDataURL.mockResolvedValue('data:image/png;base64,xyz' as never)

    await POST()

    expect(mockGenerateURI).toHaveBeenCalledWith({
      issuer: 'EmailFlow AI',
      label: 'demo@emailflow.ai',
      secret: 'SECRET123',
    })
  })

  it('returns 500 when QR generation fails', async () => {
    mockGenerateSecret.mockReturnValue('SECRET' as never)
    mockGenerateURI.mockReturnValue('otpauth://...' as never)
    mockToDataURL.mockRejectedValue(new Error('canvas error'))

    const res = await POST()

    expect(res.status).toBe(500)
    expect((await res.json()).success).toBe(false)
  })
})
