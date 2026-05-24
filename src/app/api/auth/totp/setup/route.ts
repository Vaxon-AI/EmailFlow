import { generateSecret, generateURI } from 'otplib'
import QRCode from 'qrcode'
import { success, errorFromException } from '@/lib/api-helpers'

export async function POST() {
  try {
    const secret = generateSecret()

    const uri = generateURI({
      issuer: 'EmailFlow AI',
      label: 'demo@emailflow.ai',
      secret,
    })

    const qrCodeDataUrl = await QRCode.toDataURL(uri)

    console.log('SECRET:', secret)

    return success({ secret, qrCodeDataUrl })
  } catch (err) {
    console.error('[api/auth/totp/setup]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Failed to generate QR code', 500)
  }
}