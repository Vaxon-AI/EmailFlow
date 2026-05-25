import crypto from 'node:crypto'

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown'

export type DeviceInfo = {
  deviceName: string
  deviceType: DeviceType
  browser: string
  os: string
  ipAddress: string
  userAgent: string
  deviceFingerprint: string
}

export function getIpAddress(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || ''
  }

  return request.headers.get('x-real-ip') || ''
}

export function detectDeviceType(userAgent: string): DeviceType {
  const ua = userAgent.toLowerCase()

  if (!ua) return 'unknown'
  if (/bot|crawler|spider|crawling/.test(ua)) return 'bot'
  if (/ipad|tablet/.test(ua)) return 'tablet'
  if (/mobi|iphone|android/.test(ua)) return 'mobile'
  if (/macintosh|windows|linux|x11/.test(ua)) return 'desktop'

  return 'unknown'
}

export function detectBrowser(userAgent: string) {
  if (!userAgent) return 'Unknown'
  if (/Edg\//.test(userAgent)) return 'Edge'
  if (/OPR\//.test(userAgent) || /Opera/.test(userAgent)) return 'Opera'
  if (/Firefox\//.test(userAgent)) return 'Firefox'
  if (/Chrome\//.test(userAgent) || /CriOS\//.test(userAgent)) return 'Chrome'
  if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent) && !/CriOS\//.test(userAgent)) return 'Safari'
  if (/MSIE|Trident\//.test(userAgent)) return 'Internet Explorer'
  return 'Unknown'
}

export function detectOs(userAgent: string) {
  if (!userAgent) return 'Unknown'
  if (/Windows NT/.test(userAgent)) return 'Windows'
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'iOS'
  if (/Android/.test(userAgent)) return 'Android'
  if (/Mac OS X|Macintosh/.test(userAgent)) return 'macOS'
  if (/Linux|X11/.test(userAgent)) return 'Linux'
  return 'Unknown'
}

export function formatDeviceName(deviceType: DeviceType, os: string, browser: string) {
  const typeLabel =
    deviceType === 'mobile'
      ? 'Mobile'
      : deviceType === 'tablet'
        ? 'Tablet'
        : deviceType === 'bot'
          ? 'Bot'
          : 'Desktop'

  if (os !== 'Unknown') {
    return `${typeLabel} · ${os}`
  }

  if (browser !== 'Unknown') {
    return `${typeLabel} · ${browser}`
  }

  return 'Unknown device'
}

export function createDeviceFingerprint(input: {
  deviceName: string
  deviceType: string
  browser: string
  os: string
  userAgent: string
}) {
  const normalized = [
    input.deviceName,
    input.deviceType,
    input.browser,
    input.os,
    input.userAgent.toLowerCase(),
  ]
    .map((value) => value.trim().toLowerCase())
    .join('|')

  return crypto.createHash('sha256').update(normalized).digest('hex')
}

export function getDeviceInfo(request: Request): DeviceInfo {
  const userAgent = request.headers.get('user-agent') || ''
  const deviceType = detectDeviceType(userAgent)
  const browser = detectBrowser(userAgent)
  const os = detectOs(userAgent)
  const deviceName = formatDeviceName(deviceType, os, browser)

  return {
    deviceName,
    deviceType,
    browser,
    os,
    ipAddress: getIpAddress(request),
    userAgent,
    deviceFingerprint: createDeviceFingerprint({
      deviceName,
      deviceType,
      browser,
      os,
      userAgent,
    }),
  }
}
