import { generateSecret, generateURI } from 'otplib'
import QRCode from 'qrcode'
import { defineRoute, success } from '@/lib/api-helpers'

export const POST = defineRoute(
  { tag: 'api/auth/totp/setup', code: 'SYNC_FAILED', message: 'Failed to generate QR code' },
  async () => {
    const secret = generateSecret()

    const uri = generateURI({
      issuer: 'EmailFlow AI',
      label: 'demo@emailflow.ai',
      secret,
    })

    const qrCodeDataUrl = await QRCode.toDataURL(uri)

    console.log('SECRET:', secret)

    return success({ secret, qrCodeDataUrl })
  },
)
