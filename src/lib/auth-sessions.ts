import crypto from 'node:crypto'

import type { Prisma } from '@prisma/client'
import { AppError } from '@/lib/app-errors'
import { prisma } from '@/lib/prisma'
import { sendNewDeviceLoginEmail, sendSuspiciousActivityEmail } from '@/lib/mailer'
import { SESSION_MAX_AGE_REMEMBER_SECONDS } from '@/lib/auth-token'

const ACTIVE_STATUS = 'active'
const EXPIRED_STATUS = 'expired'
const REVOKED_STATUS = 'revoked'
const LAST_ACTIVE_UPDATE_INTERVAL_MS = 5 * 60 * 1000
const MAX_ACTIVE_SESSIONS = 3
const SESSION_INACTIVITY_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000
// After rotation, the old token is accepted for this many ms (handles in-flight concurrent requests)
const ROTATION_GRACE_PERIOD_MS = 30 * 1000

type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown'

type ActiveSessionDevice = {
  id: string
  deviceName: string
  browser: string
  os: string
  userAgent: string
  deviceType: string
  deviceFingerprint: string | null
  ipAddress?: string
  lastActiveAt?: Date
  expiresAt?: Date
  createdAt?: Date
}

export type DeviceLimitDevice = {
  id: string
  deviceName: string
  deviceType: string
  browser: string
  os: string
  ipAddress: string
  userAgent: string
  lastActiveAt: Date
  expiresAt: Date
  createdAt: Date
}

export interface SessionUser {
  id: string
  email: string
  name: string
  isAdmin: boolean
  manualReviewMode: boolean
  plan: string
}

export interface SessionContext {
  session: {
    id: string
    userId: string
    deviceName: string
    deviceType: string
    browser: string
    os: string
    ipAddress: string
    userAgent: string
    isNewDevice: boolean
    remember: boolean
    lastActiveAt: Date
    expiresAt: Date
    revokedAt: Date | null
    status: string
    createdAt: Date
    updatedAt: Date
  }
  user: SessionUser
}

function getIpAddress(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || ''
  }

  return request.headers.get('x-real-ip') || ''
}

function detectDeviceType(userAgent: string): DeviceType {
  const ua = userAgent.toLowerCase()

  if (!ua) return 'unknown'
  if (/bot|crawler|spider|crawling/.test(ua)) return 'bot'
  if (/ipad|tablet/.test(ua)) return 'tablet'
  if (/mobi|iphone|android/.test(ua)) return 'mobile'
  if (/macintosh|windows|linux|x11/.test(ua)) return 'desktop'

  return 'unknown'
}

function detectBrowser(userAgent: string) {
  if (!userAgent) return 'Unknown'
  if (/Edg\//.test(userAgent)) return 'Edge'
  if (/OPR\//.test(userAgent) || /Opera/.test(userAgent)) return 'Opera'
  if (/Firefox\//.test(userAgent)) return 'Firefox'
  if (/Chrome\//.test(userAgent) || /CriOS\//.test(userAgent)) return 'Chrome'
  if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent) && !/CriOS\//.test(userAgent)) return 'Safari'
  if (/MSIE|Trident\//.test(userAgent)) return 'Internet Explorer'
  return 'Unknown'
}

function detectOs(userAgent: string) {
  if (!userAgent) return 'Unknown'
  if (/Windows NT/.test(userAgent)) return 'Windows'
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'iOS'
  if (/Android/.test(userAgent)) return 'Android'
  if (/Mac OS X|Macintosh/.test(userAgent)) return 'macOS'
  if (/Linux|X11/.test(userAgent)) return 'Linux'
  return 'Unknown'
}

function formatDeviceName(deviceType: DeviceType, os: string, browser: string) {
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

function createDeviceFingerprint(input: {
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

function getDeviceInfo(request: Request) {
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

function sessionTokenHash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function deviceKey(session: Pick<ActiveSessionDevice, 'id' | 'deviceName' | 'browser' | 'os' | 'userAgent' | 'deviceFingerprint'>) {
  return session.deviceFingerprint || [
    session.deviceName,
    session.browser,
    session.os,
    session.userAgent,
  ].map((value) => String(value || '').trim().toLowerCase()).join('|') || session.id
}

function isSameDevice(session: ActiveSessionDevice, device: ReturnType<typeof getDeviceInfo>) {
  if (session.deviceFingerprint && session.deviceFingerprint === device.deviceFingerprint) return true
  return (
    session.deviceName === device.deviceName &&
    session.browser === device.browser &&
    session.os === device.os &&
    session.userAgent === device.userAgent
  )
}

function uniqueLatestDevices<T extends ActiveSessionDevice>(sessions: T[]) {
  const byDevice = new Map<string, T>()
  const sorted = [...sessions].sort((a, b) => {
    const aLast = a.lastActiveAt?.getTime() ?? 0
    const bLast = b.lastActiveAt?.getTime() ?? 0
    if (aLast !== bLast) return bLast - aLast
    return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
  })

  for (const session of sorted) {
    const key = deviceKey(session)
    if (!byDevice.has(key)) byDevice.set(key, session)
  }

  return [...byDevice.values()]
}

function toDeviceLimitDevices(sessions: ActiveSessionDevice[]): DeviceLimitDevice[] {
  return uniqueLatestDevices(sessions)
    .filter((session): session is ActiveSessionDevice & { lastActiveAt: Date; expiresAt: Date; createdAt: Date } =>
      Boolean(session.lastActiveAt && session.expiresAt && session.createdAt)
    )
    .map((session) => ({
      id: session.id,
      deviceName: session.deviceName,
      deviceType: session.deviceType,
      browser: session.browser,
      os: session.os,
      ipAddress: session.ipAddress || '',
      userAgent: session.userAgent,
      lastActiveAt: session.lastActiveAt,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
    }))
}

function createRawSessionToken() {
  return crypto.randomBytes(32).toString('base64url')
}

async function markSessionExpired(sessionId: string) {
  await prisma.session.update({
    where: { id: sessionId },
    data: { status: EXPIRED_STATUS },
  }).catch(() => null)
}

function isInactiveExpired(lastActiveAt: Date, now: Date) {
  return now.getTime() - lastActiveAt.getTime() >= SESSION_INACTIVITY_TIMEOUT_MS
}

function toSessionUser(user: {
  id: string
  email: string
  name: string | null
  isAdmin: boolean
  manualReviewMode: boolean
  plan: string
}): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name || 'User',
    isAdmin: user.isAdmin,
    manualReviewMode: user.manualReviewMode,
    plan: user.plan,
  }
}

export async function createUserSession(input: {
  userId: string
  userEmail?: string
  remember?: boolean
  request: Request
  sendNewDeviceAlert?: boolean
}) {
  const remember = Boolean(input.remember)
  const sendNewDeviceAlert = input.sendNewDeviceAlert !== false
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_REMEMBER_SECONDS * 1000)
  const rawToken = createRawSessionToken()
  const tokenHash = sessionTokenHash(rawToken)
  const device = getDeviceInfo(input.request)

  const { session, userEmail } = await prisma.$transaction(async (tx) => {
    const activeSessions = await tx.session.findMany({
      where: {
        userId: input.userId,
        status: ACTIVE_STATUS,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: [{ lastActiveAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        deviceName: true,
        browser: true,
        os: true,
        userAgent: true,
        deviceType: true,
        deviceFingerprint: true,
        ipAddress: true,
        lastActiveAt: true,
        expiresAt: true,
        createdAt: true,
      },
    })

    const matchingDeviceIds = activeSessions
      .filter((existingSession) => isSameDevice(existingSession, device))
      .map((session) => session.id)
    const isKnownDevice = matchingDeviceIds.length > 0
    const activeOtherDevices = uniqueLatestDevices(
      activeSessions.filter((existingSession) => !isSameDevice(existingSession, device))
    )

    if (!isKnownDevice && activeOtherDevices.length >= MAX_ACTIVE_SESSIONS) {
      throw new AppError(
        'DEVICE_LIMIT_REACHED',
        'You can stay signed in on up to 3 browsers or devices. Sign out one device to continue.',
        409,
        { userId: input.userId, remember, devices: toDeviceLimitDevices(activeOtherDevices) }
      )
    }

    if (matchingDeviceIds.length > 0) {
      await tx.session.updateMany({
        where: { id: { in: matchingDeviceIds } },
        data: {
          status: REVOKED_STATUS,
          revokedAt: now,
        },
      })
    }

    const session = await tx.session.create({
      data: {
        userId: input.userId,
        tokenHash,
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        browser: device.browser,
        os: device.os,
        ipAddress: device.ipAddress,
        userAgent: device.userAgent,
        deviceFingerprint: device.deviceFingerprint,
        isNewDevice: !isKnownDevice,
        remember,
        lastActiveAt: now,
        expiresAt,
        status: ACTIVE_STATUS,
      },
    })

    return { session, userEmail: input.userEmail ?? null }
  })

  if (sendNewDeviceAlert) {
    queueNewDeviceAlert({
      session,
      userEmail,
    })
  }

  return { session, rawToken, expiresAt, isNewDevice: session.isNewDevice }
}

function queueNewDeviceAlert(input: {
  session: {
    isNewDevice: boolean
    browser: string
    os: string
    ipAddress: string
    deviceName: string
    createdAt: Date
  }
  userEmail: string | null
}) {
  if (!input.session.isNewDevice || !input.userEmail) return
  const userEmail = input.userEmail

  setImmediate(async () => {
    try {
      await sendNewDeviceLoginEmail({
        to: userEmail,
        loginTime: input.session.createdAt,
        browser: input.session.browser,
        os: input.session.os,
        ipAddress: input.session.ipAddress,
        deviceName: input.session.deviceName,
      })

      await handleSuspiciousLoginSignal()
    } catch (err) {
      console.error('[auth-sessions] Failed to send new device alert', err)
    }
  })
}

function queueSuspiciousActivityAlert(input: {
  userId: string
  userEmail: string
  reason: 'rotated_token_replay'
  ipAddress: string
  deviceName: string
}) {
  setImmediate(async () => {
    try {
      await sendSuspiciousActivityEmail({
        to: input.userEmail,
        reason: input.reason,
        ipAddress: input.ipAddress,
        deviceName: input.deviceName,
      })
    } catch (err) {
      console.error('[auth-sessions] Failed to send suspicious activity alert', err)
    }
  })
}

async function handleSuspiciousLoginSignal() {
  // Reserved hook for additional anomaly detection (impossible travel, geo mismatch, etc.)
}

const SESSION_INCLUDE = {
  user: { select: { id: true, email: true, name: true, isAdmin: true, manualReviewMode: true, plan: true } },
} as const satisfies Prisma.SessionInclude

type SessionWithUser = Prisma.SessionGetPayload<{ include: typeof SESSION_INCLUDE }>

/** Resolve which session record to use for the given token hash, handling rotation replay. */
async function resolveSession(hash: string, now: Date): Promise<SessionWithUser | null> {
  // Single query covers both the active-token case and the rotation-grace-period case.
  const session = await prisma.session.findFirst({
    where: { OR: [{ tokenHash: hash }, { previousTokenHash: hash }] },
    include: SESSION_INCLUDE,
  })

  if (!session) return null

  // Primary match: token is still the current active token
  if (session.tokenHash === hash) return session

  // Secondary match: token was recently rotated
  if (!session.rotatedAt) return null

  const ageMs = now.getTime() - session.rotatedAt.getTime()

  if (ageMs <= ROTATION_GRACE_PERIOD_MS) {
    // Concurrent request that raced with the rotation — allow through using the new session
    return session
  }

  // Old token submitted well after rotation — possible session hijack
  await prisma.session.updateMany({
    where: { userId: session.userId, status: ACTIVE_STATUS },
    data: { status: REVOKED_STATUS, revokedAt: now },
  })

  queueSuspiciousActivityAlert({
    userId: session.userId,
    userEmail: session.user.email,
    reason: 'rotated_token_replay',
    ipAddress: session.ipAddress,
    deviceName: session.deviceName,
  })

  return null
}

export async function validateSessionToken(token: string | null): Promise<SessionContext | null> {
  try {
    return await requireSessionToken(token)
  } catch {
    return null
  }
}

export async function requireSessionToken(token: string | null): Promise<SessionContext> {
  if (!token) {
    throw new AppError('UNAUTHORIZED', 'Authentication required.', 401)
  }

  const now = new Date()
  const hash = sessionTokenHash(token)

  const session = await resolveSession(hash, now)
  if (!session) {
    throw new AppError('UNAUTHORIZED', 'Authentication required.', 401)
  }

  if (session.status !== ACTIVE_STATUS || session.revokedAt) {
    const code = session.revokedAt || session.status === REVOKED_STATUS ? 'SESSION_REVOKED' : 'UNAUTHORIZED'
    const message =
      code === 'SESSION_REVOKED'
        ? 'This session has been revoked. Please sign in again.'
        : 'Authentication required.'
    throw new AppError(code, message, 401)
  }

  if (session.expiresAt <= now) {
    if (session.status === ACTIVE_STATUS) {
      await markSessionExpired(session.id)
    }
    throw new AppError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.', 401)
  }

  if (isInactiveExpired(session.lastActiveAt, now)) {
    if (session.status === ACTIVE_STATUS) {
      await markSessionExpired(session.id)
    }
    throw new AppError('SESSION_INACTIVE_EXPIRED', 'Your session expired after inactivity. Please sign in again.', 401)
  }

  if (now.getTime() - session.lastActiveAt.getTime() >= LAST_ACTIVE_UPDATE_INTERVAL_MS) {
    const updated = await prisma.session.update({
      where: { id: session.id },
      data: { lastActiveAt: now },
    })
    session.lastActiveAt = updated.lastActiveAt
    session.updatedAt = updated.updatedAt
  }

  return {
    session: {
      id: session.id,
      userId: session.userId,
      deviceName: session.deviceName,
      deviceType: session.deviceType,
      browser: session.browser,
      os: session.os,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      isNewDevice: session.isNewDevice,
      remember: session.remember,
      lastActiveAt: session.lastActiveAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      status: session.status,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
    user: toSessionUser(session.user),
  }
}

/**
 * Rotates the session token: generates a new token, moves the old hash to
 * `previousTokenHash` for the grace-period replay check, and returns the new raw token.
 *
 * Uses an optimistic conditional UPDATE so only one concurrent rotation wins.
 * If the old token was already rotated within the grace window (concurrent refresh call),
 * returns null — the caller should treat this as "rotation already happened, reuse cookie".
 */
export async function rotateSessionToken(
  oldToken: string,
): Promise<{ newRawToken: string } | null> {
  const now = new Date()
  const oldHash = sessionTokenHash(oldToken)

  // First verify the session is valid via the current tokenHash
  const session = await prisma.session.findUnique({
    where: { tokenHash: oldHash },
    select: { id: true, status: true, expiresAt: true, revokedAt: true },
  })

  if (!session) {
    // Maybe it was already rotated within the grace period
    const recentlyRotated = await prisma.session.findFirst({
      where: {
        previousTokenHash: oldHash,
        status: ACTIVE_STATUS,
        expiresAt: { gt: now },
        rotatedAt: { gt: new Date(now.getTime() - ROTATION_GRACE_PERIOD_MS) },
      },
    })
    if (recentlyRotated) {
      // Already rotated by a concurrent request — signal the caller to no-op
      return null
    }
    return null
  }

  if (session.expiresAt <= now || session.status !== ACTIVE_STATUS || session.revokedAt) {
    return null
  }

  const newRawToken = createRawSessionToken()
  const newHash = sessionTokenHash(newRawToken)

  // Atomic rotation: only succeeds if the current tokenHash still matches
  // (prevents double-rotation race conditions)
  try {
    await prisma.session.update({
      where: { tokenHash: oldHash },
      data: {
        tokenHash: newHash,
        previousTokenHash: oldHash,
        rotatedAt: now,
      },
    })
  } catch {
    // P2025 (record not found) means another concurrent request already rotated it
    return null
  }

  return { newRawToken }
}

export async function revokeSessionById(sessionId: string, userId: string) {
  const now = new Date()
  const target = await prisma.session.findFirst({
    where: {
      id: sessionId,
      userId,
      status: ACTIVE_STATUS,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    select: {
      id: true,
      deviceFingerprint: true,
      deviceName: true,
      browser: true,
      os: true,
      userAgent: true,
    },
  })

  if (!target) return false

  const fingerprintFilter = target.deviceFingerprint
    ? { deviceFingerprint: target.deviceFingerprint }
    : {
        deviceName: target.deviceName,
        browser: target.browser,
        os: target.os,
        userAgent: target.userAgent,
      }

  const result = await prisma.session.updateMany({
    where: {
      userId,
      status: ACTIVE_STATUS,
      revokedAt: null,
      expiresAt: { gt: now },
      ...fingerprintFilter,
    },
    data: {
      status: REVOKED_STATUS,
      revokedAt: now,
    },
  })

  return result.count > 0
}

export async function revokeSessionByToken(token: string | null) {
  if (!token) return false

  const now = new Date()
  const result = await prisma.session.updateMany({
    where: {
      tokenHash: sessionTokenHash(token),
      status: ACTIVE_STATUS,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      status: REVOKED_STATUS,
      revokedAt: now,
    },
  })

  return result.count > 0
}

export async function revokeOtherSessions(userId: string, currentSessionId: string) {
  const now = new Date()
  const result = await prisma.session.updateMany({
    where: {
      userId,
      id: { not: currentSessionId },
      status: ACTIVE_STATUS,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      status: REVOKED_STATUS,
      revokedAt: now,
    },
  })

  return result.count
}

export async function listActiveSessions(userId: string) {
  const now = new Date()

  await prisma.session.updateMany({
    where: {
      userId,
      status: ACTIVE_STATUS,
      revokedAt: null,
      OR: [
        { expiresAt: { lte: now } },
        { lastActiveAt: { lte: new Date(now.getTime() - SESSION_INACTIVITY_TIMEOUT_MS) } },
      ],
    },
    data: { status: EXPIRED_STATUS },
  })

  const sessions = await prisma.session.findMany({
    where: {
      userId,
      status: ACTIVE_STATUS,
      revokedAt: null,
      expiresAt: { gt: now },
      lastActiveAt: { gt: new Date(now.getTime() - SESSION_INACTIVITY_TIMEOUT_MS) },
    },
    orderBy: [{ lastActiveAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      deviceName: true,
      deviceType: true,
      browser: true,
      os: true,
      ipAddress: true,
      userAgent: true,
      deviceFingerprint: true,
      isNewDevice: true,
      lastActiveAt: true,
      expiresAt: true,
      createdAt: true,
    },
  })

  return uniqueLatestDevices(sessions)
}
