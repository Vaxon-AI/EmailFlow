import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createDeviceFingerprint,
  detectBrowser,
  detectDeviceType,
  detectOs,
  formatDeviceName,
  getDeviceInfo,
  getIpAddress,
} from '../session-device'

describe('session-device', () => {
  it('extracts the first forwarded IP address', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1', 'x-real-ip': '10.0.0.2' },
    })

    expect(getIpAddress(req)).toBe('203.0.113.10')
  })

  it('detects mobile safari on iphone', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'

    expect(detectDeviceType(ua)).toBe('mobile')
    expect(detectBrowser(ua)).toBe('Safari')
    expect(detectOs(ua)).toBe('iOS')
    expect(formatDeviceName('mobile', 'iOS', 'Safari')).toBe('Mobile · iOS')
  })

  it('detects bots explicitly', () => {
    expect(detectDeviceType('Googlebot/2.1 (+http://www.google.com/bot.html)')).toBe('bot')
  })

  it('builds a stable device fingerprint from normalized fields', () => {
    const fingerprint = createDeviceFingerprint({
      deviceName: ' Desktop · macOS ',
      deviceType: 'desktop',
      browser: 'Chrome',
      os: 'macOS',
      userAgent: 'Mozilla/5.0',
    })

    expect(fingerprint).toBe(
      crypto.createHash('sha256').update('desktop · macos|desktop|chrome|macos|mozilla/5.0').digest('hex'),
    )
  })

  it('derives complete device info from a request', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120.0'
    const req = new Request('http://localhost', {
      headers: { 'user-agent': ua, 'x-real-ip': '127.0.0.1' },
    })

    expect(getDeviceInfo(req)).toEqual({
      deviceName: 'Desktop · macOS',
      deviceType: 'desktop',
      browser: 'Chrome',
      os: 'macOS',
      ipAddress: '127.0.0.1',
      userAgent: ua,
      deviceFingerprint: crypto.createHash('sha256').update([
        'Desktop · macOS',
        'desktop',
        'Chrome',
        'macOS',
        ua.toLowerCase(),
      ].join('|').toLowerCase()).digest('hex'),
    })
  })
})
