import { google, gmail_v1 } from 'googleapis'
import { GaxiosError } from 'gaxios'
import { AppError } from '@/lib/app-errors'
import { prisma } from '@/lib/prisma'
import { clearProviderReauthRequired, markProviderReauthRequired } from '@/lib/provider-reauth'
import type { EmailProvider, EmailMessage, NormalizedCategory } from '../email-provider'

// ============================================================
// Gmail Integration
// Implements the EmailProvider interface for Google Gmail
// ============================================================

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
  )
}

function getErrorText(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

function getGoogleErrorReason(error: unknown): string | null {
  if (!(error instanceof GaxiosError)) return null

  const responseData = error.response?.data as
    | { error?: string; error_description?: string; error_subtype?: string }
    | { error?: { message?: string; status?: string; errors?: Array<{ reason?: string }> } }
    | undefined

  if (typeof responseData?.error === 'string') {
    return responseData.error
  }

  if (responseData?.error && typeof responseData.error === 'object') {
    return responseData.error.errors?.[0]?.reason || responseData.error.status || responseData.error.message || null
  }

  return null
}

function isTemporaryProviderError(error: unknown) {
  if (!(error instanceof GaxiosError)) return false
  const status = error.response?.status
  return !status || status >= 500 || status === 429
}

function isInvalidCredentialError(error: unknown) {
  if (!(error instanceof GaxiosError)) return false
  const status = error.response?.status
  const reason = getGoogleErrorReason(error)?.toLowerCase() || ''
  const message = getErrorText(error).toLowerCase()
  return (
    status === 401 ||
    reason.includes('invalid_grant') ||
    reason.includes('invalidcredentials') ||
    message.includes('invalid credentials') ||
    message.includes('invalid grant')
  )
}

async function persistRefreshedTokens(input: {
  userId: string
  accessToken: string
  refreshToken?: string | null
  expiryDate?: Date | null
}) {
  await prisma.user.update({
    where: { id: input.userId },
    data: {
      gmailAccessToken: input.accessToken,
      gmailRefreshToken: input.refreshToken ?? undefined,
      gmailTokenExpiry: input.expiryDate ?? null,
    },
  })
}

async function refreshAccessToken(userId: string, oauth2: InstanceType<typeof google.auth.OAuth2>) {
  try {
    const refreshed = await oauth2.refreshAccessToken()
    const credentials = refreshed.credentials
    const accessToken = credentials.access_token

    if (!accessToken) {
      await markProviderReauthRequired(userId, 'gmail', 'refresh_failed')
      throw new AppError(
        'PROVIDER_REAUTH_REQUIRED',
        'Your Gmail connection has expired. Please reconnect it to continue syncing.',
        401,
        { provider: 'gmail', reason: 'refresh_failed' },
      )
    }

    const expiryDate = credentials.expiry_date ? new Date(credentials.expiry_date) : null

    await persistRefreshedTokens({
      userId,
      accessToken,
      refreshToken: credentials.refresh_token,
      expiryDate,
    })
    await clearProviderReauthRequired(userId, 'gmail')
    oauth2.setCredentials({
      access_token: accessToken,
      refresh_token: credentials.refresh_token || oauth2.credentials.refresh_token || undefined,
      expiry_date: credentials.expiry_date || undefined,
    })
  } catch (error) {
    if (isTemporaryProviderError(error)) {
      throw new AppError(
        'SYNC_TEMPORARY_ERROR',
        'Gmail is temporarily unavailable. Please try syncing again shortly.',
        503,
        { provider: 'gmail' },
      )
    }

    const reason = getGoogleErrorReason(error)?.toLowerCase() || ''
    const mappedReason =
      reason.includes('invalid_grant') || reason.includes('revoked')
        ? 'invalid_grant'
        : 'refresh_failed'

    await markProviderReauthRequired(userId, 'gmail', mappedReason)
    console.error('[gmail] refresh token failed', { userId, reason: mappedReason, error: getErrorText(error) })

    throw new AppError(
      'PROVIDER_REAUTH_REQUIRED',
      'Your Gmail connection has expired. Please reconnect it to continue syncing.',
      401,
      { provider: 'gmail', reason: mappedReason },
    )
  }
}

async function getAuthenticatedClient(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      gmailAccessToken: true,
      gmailRefreshToken: true,
      gmailTokenExpiry: true,
      emailProviderReauthRequired: true,
      emailProviderReauthProvider: true,
      emailProviderReauthReason: true,
    },
  })

  if (!user?.gmailRefreshToken) {
    await markProviderReauthRequired(userId, 'gmail', 'missing_refresh_token')
    throw new AppError(
      'PROVIDER_REAUTH_REQUIRED',
      'Your Gmail connection is missing a refresh token. Please reconnect it.',
      401,
      { provider: 'gmail', reason: 'missing_refresh_token' },
    )
  }

  if (user.emailProviderReauthRequired && user.emailProviderReauthProvider === 'gmail') {
    throw new AppError(
      'PROVIDER_REAUTH_REQUIRED',
      'Your Gmail connection has expired. Please reconnect it to continue syncing.',
      401,
      { provider: 'gmail', reason: user.emailProviderReauthReason || 'refresh_failed' },
    )
  }

  const oauth2 = getOAuth2Client()
  oauth2.setCredentials({
    access_token: user.gmailAccessToken || undefined,
    refresh_token: user.gmailRefreshToken,
    expiry_date: user.gmailTokenExpiry?.getTime() || undefined,
  })

  const expiresSoon =
    !user.gmailAccessToken ||
    !user.gmailTokenExpiry ||
    user.gmailTokenExpiry.getTime() <= Date.now() + 60 * 1000

  if (expiresSoon) {
    await refreshAccessToken(userId, oauth2)
  }

  return oauth2
}

function decodeBase64Url(data: string): string {
  const buff = Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  return buff.toString('utf-8')
}

function extractBody(payload: gmail_v1.Schema$MessagePart): string {
  const bodyData = payload.body?.data
  if (bodyData) {
    return decodeBase64Url(bodyData)
  }
  if (payload.parts) {
    const textPart = payload.parts.find((p) => p.mimeType === 'text/plain')
    const textData = textPart?.body?.data
    if (textData) {
      return decodeBase64Url(textData)
    }
    const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html')
    const htmlData = htmlPart?.body?.data
    if (htmlData) {
      const html = decodeBase64Url(htmlData)
      return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    }
    for (const part of payload.parts) {
      if (part.parts) {
        const result = extractBody(part)
        if (result) return result
      }
    }
  }
  return ''
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[], name: string): string {
  const h = headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())
  return h?.value || ''
}

// ---- Gmail → Normalized Category Mapping ----

const GMAIL_CATEGORY_MAP: Record<string, NormalizedCategory> = {
  'SPAM': 'spam',
  'CATEGORY_PROMOTIONS': 'promotions',
  'CATEGORY_SOCIAL': 'social',
  'CATEGORY_UPDATES': 'updates',
  'CATEGORY_FORUMS': 'social',
}

function mapGmailLabelsToCategories(labels: string[]): NormalizedCategory[] {
  const categories: NormalizedCategory[] = []
  for (const label of labels) {
    const mapped = GMAIL_CATEGORY_MAP[label]
    if (mapped) categories.push(mapped)
  }
  return categories
}

// ---- Gmail Provider Implementation ----

export const gmailProvider: EmailProvider = {
  name: 'gmail',

  async fetchNewEmails(userId: string, options?: { since?: Date; maxResults?: number }): Promise<EmailMessage[]> {
    try {
      const auth = await getAuthenticatedClient(userId)
      const gmail = google.gmail({ version: 'v1', auth })

      let startDate: Date
      if (options?.since) {
        startDate = options.since
      } else {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { syncStartDate: true },
        })

        if (user?.syncStartDate) {
          startDate = user.syncStartDate
        } else {
          startDate = new Date()
          startDate.setDate(startDate.getDate() - 7)
          await prisma.user.update({
            where: { id: userId },
            data: { syncStartDate: startDate },
          })
        }
      }

      const afterStr = Math.floor(startDate.getTime() / 1000).toString()

      const existingIds = new Set(
        (
          await prisma.email.findMany({
            where: { userId },
            select: { gmailMessageId: true },
          })
        ).map((e) => e.gmailMessageId)
      )

      // Cap at the Gmail page size (100). Caller may request fewer when the
      // user's free-plan quota is nearly exhausted, to avoid storing emails
      // that will never be classified.
      const maxResults = Math.max(1, Math.min(options?.maxResults ?? 100, 100))

      const listRes = await gmail.users.messages.list({
        userId: 'me',
        q: `after:${afterStr}`,
        maxResults,
      })

      const messageIds = (listRes.data.messages || [])
        .map((m) => m.id!)
        .filter((id) => !existingIds.has(id))

      if (messageIds.length === 0) return []

      const messages: EmailMessage[] = []
      const batchSize = 10

      for (let i = 0; i < messageIds.length; i += batchSize) {
        const batch = messageIds.slice(i, i + batchSize)

        const results = await Promise.all(
          batch.map(async (msgId) => {
            try {
              const res = await gmail.users.messages.get({
                userId: 'me',
                id: msgId,
                format: 'full',
              })
              return res.data
            } catch {
              console.warn(`Failed to fetch message ${msgId}`)
              return null
            }
          })
        )

        for (const msg of results) {
          if (!msg || !msg.payload) continue

          const headers = msg.payload.headers || []
          const bodyFull = extractBody(msg.payload)
          const subject = getHeader(headers, 'Subject') || '(no subject)'
          const sender = getHeader(headers, 'From')
          const to = getHeader(headers, 'To')
          const cc = getHeader(headers, 'Cc')
          const dateStr = getHeader(headers, 'Date')
          const receivedAt = dateStr ? new Date(dateStr) : new Date()

          const recipients = [to, cc].filter(Boolean)
          const hasAttachments = !!(
            msg.payload.parts?.some((p) => p.filename && p.filename.length > 0)
          )

          const gmailLabels = msg.labelIds || []
          const providerCategories = mapGmailLabelsToCategories(gmailLabels)

          messages.push({
            providerMessageId: msg.id!,
            threadId: msg.threadId || null,
            subject,
            sender,
            recipients,
            bodyPreview: bodyFull.slice(0, 2000),
            bodyFull,
            receivedAt,
            labels: gmailLabels,
            providerCategories,
            hasAttachments,
          })
        }
      }

      await clearProviderReauthRequired(userId, 'gmail')
      return messages
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }

      if (isInvalidCredentialError(error)) {
        await markProviderReauthRequired(userId, 'gmail', 'access_token_invalid')
        console.error('[gmail] provider auth invalid during fetch', { userId, error: getErrorText(error) })
        throw new AppError(
          'PROVIDER_REAUTH_REQUIRED',
          'Your Gmail connection has expired. Please reconnect it to continue syncing.',
          401,
          { provider: 'gmail', reason: 'access_token_invalid' },
        )
      }

      if (isTemporaryProviderError(error)) {
        throw new AppError(
          'SYNC_TEMPORARY_ERROR',
          'Gmail is temporarily unavailable. Please try syncing again shortly.',
          503,
          { provider: 'gmail' },
        )
      }

      console.error('[gmail] fetchNewEmails failed', { userId, error: getErrorText(error) })
      throw new AppError('SYNC_FAILED', 'Failed to sync Gmail right now.', 500, { provider: 'gmail' })
    }
  },

  async previewCount(userId: string, { since }: { since: Date }): Promise<{ quotaImpactCount: number; capped: boolean }> {
    try {
      const auth = await getAuthenticatedClient(userId)
      const gmail = google.gmail({ version: 'v1', auth })
      const afterStr = Math.floor(since.getTime() / 1000).toString()

      // We can't trust resultSizeEstimate — empirically returns a sentinel
      // (~201) for many accounts when maxResults is small. Page through ids
      // ourselves and count exactly, capped at SOFT_CAP. category:primary
      // matches what pre-filter doesn't drop (promotions/social/updates are
      // auto-ignored without burning AI quota).
      const SOFT_CAP = 500
      let count = 0
      let pageToken: string | undefined
      let capped = false
      do {
        const res = await gmail.users.messages.list({
          userId: 'me',
          q: `after:${afterStr} category:primary`,
          maxResults: 500,
          pageToken,
        })
        count += res.data.messages?.length ?? 0
        pageToken = res.data.nextPageToken ?? undefined
        if (count >= SOFT_CAP) {
          capped = !!pageToken
          break
        }
      } while (pageToken)

      return { quotaImpactCount: count, capped }
    } catch (error) {
      if (error instanceof AppError) throw error

      if (isInvalidCredentialError(error)) {
        await markProviderReauthRequired(userId, 'gmail', 'access_token_invalid')
        throw new AppError(
          'PROVIDER_REAUTH_REQUIRED',
          'Your Gmail connection has expired. Please reconnect it to continue syncing.',
          401,
          { provider: 'gmail', reason: 'access_token_invalid' },
        )
      }

      if (isTemporaryProviderError(error)) {
        throw new AppError(
          'SYNC_TEMPORARY_ERROR',
          'Gmail is temporarily unavailable. Please try again shortly.',
          503,
          { provider: 'gmail' },
        )
      }

      console.error('[gmail] previewCount failed', { userId, error: getErrorText(error) })
      throw new AppError('SYNC_FAILED', 'Failed to preview Gmail right now.', 500, { provider: 'gmail' })
    }
  },

  async disconnect(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { gmailAccessToken: true },
    })

    if (user?.gmailAccessToken) {
      try {
        const oauth2 = getOAuth2Client()
        await oauth2.revokeToken(user.gmailAccessToken)
      } catch {
        // Token might already be invalid
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        gmailEmail: null,
        gmailAccessToken: null,
        gmailRefreshToken: null,
        gmailTokenExpiry: null,
        gmailConnected: false,
        syncEnabled: false,
        lastSyncAt: null,
        emailProviderReauthRequired: false,
        emailProviderReauthReason: null,
        emailProviderReauthAt: null,
        emailProviderReauthProvider: null,
      },
    })
  },
}

/**
 * Fetches the full body of a single Gmail message by its provider message ID.
 * Used by the retention restore flow to re-hydrate METADATA_ONLY emails.
 * Handles token refresh automatically via getAuthenticatedClient.
 *
 * Returns the extracted plain text body, or empty string if the message
 * cannot be fetched (deleted from Gmail, permissions revoked, etc.).
 */
export async function fetchGmailMessageBody(
  userId: string,
  gmailMessageId: string
): Promise<string> {
  const auth = await getAuthenticatedClient(userId)
  const gmail = google.gmail({ version: 'v1', auth })

  const res = await gmail.users.messages.get({
    userId: 'me',
    id: gmailMessageId,
    format: 'full',
  })

  if (!res.data.payload) return ''
  return extractBody(res.data.payload)
}
