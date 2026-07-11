import { AppError } from '@/lib/app-errors'
import { prisma } from '@/lib/prisma'
import { refreshMicrosoftToken } from '@/lib/microsoft-oauth'
import { clearProviderReauthRequired, markProviderReauthRequired } from '@/lib/provider-reauth'
import type { ProviderReauthReason } from '@/lib/provider-reauth'
import type { EmailProvider, EmailMessage, FetchNewEmailsOptions } from '../email-provider'

// ============================================================
// Outlook Integration
// Implements the EmailProvider interface for Microsoft Outlook
// via the Microsoft Graph API. Tokens live on the Account row
// only (provider: 'microsoft') — no user-level token copy.
// ============================================================

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const FETCH_TIMEOUT_MS = 10_000
// Hard page cap so one sync never walks an unbounded inbox
const MAX_PAGES = 5
const PAGE_SIZE = 50

const MESSAGE_SELECT = [
  'id',
  'conversationId',
  'subject',
  'from',
  'toRecipients',
  'ccRecipients',
  'receivedDateTime',
  'sentDateTime',
  'bodyPreview',
  'body',
  'hasAttachments',
  'isRead',
  'importance',
  'internetMessageId',
].join(',')

interface GraphEmailAddress {
  emailAddress?: { name?: string | null; address?: string | null }
}

interface GraphMessage {
  id: string
  conversationId?: string | null
  subject?: string | null
  from?: GraphEmailAddress | null
  toRecipients?: GraphEmailAddress[] | null
  ccRecipients?: GraphEmailAddress[] | null
  receivedDateTime?: string | null
  sentDateTime?: string | null
  bodyPreview?: string | null
  body?: { contentType?: string | null; content?: string | null } | null
  hasAttachments?: boolean | null
  isRead?: boolean | null
  importance?: string | null
  internetMessageId?: string | null
}

interface GraphMessageListResponse {
  value?: GraphMessage[]
  '@odata.nextLink'?: string
}

class GraphRequestError extends Error {
  constructor(public readonly status: number) {
    super(`Microsoft Graph request failed with status ${status}`)
    this.name = 'GraphRequestError'
  }
}

function isTemporaryProviderError(error: unknown) {
  if (!(error instanceof GraphRequestError)) return false
  return error.status === 0 || error.status >= 500 || error.status === 429
}

function isInvalidCredentialError(error: unknown) {
  return error instanceof GraphRequestError && error.status === 401
}

async function graphFetch<T>(url: string, accessToken: string, extraHeaders?: Record<string, string>): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...extraHeaders,
      },
      signal: controller.signal,
    })
  } catch {
    // Network failure / timeout — classified as temporary
    throw new GraphRequestError(0)
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    throw new GraphRequestError(res.status)
  }

  return (await res.json()) as T
}

// ---- Reauth marking (Account-level, falling back to user-level) ----

async function markAccountReauthRequired(userId: string, accountId: string | undefined, reason: ProviderReauthReason) {
  if (accountId) {
    await prisma.account.update({
      where: { id: accountId },
      data: {
        reauthRequired: true,
        reauthReason: reason,
        reauthAt: new Date(),
        reauthProvider: 'outlook',
      },
    })
  } else {
    await markProviderReauthRequired(userId, 'outlook', reason)
  }
}

async function clearAccountReauthRequired(userId: string, accountId?: string) {
  if (accountId) {
    await prisma.account.update({
      where: { id: accountId },
      data: { reauthRequired: false, reauthReason: null, reauthAt: null, reauthProvider: null },
    })
  } else {
    await clearProviderReauthRequired(userId, 'outlook')
  }
}

function reauthError(reason: ProviderReauthReason, accountId?: string) {
  return new AppError(
    'PROVIDER_REAUTH_REQUIRED',
    'Your Outlook connection has expired. Please reconnect it to continue syncing.',
    401,
    { provider: 'outlook', reason, ...(accountId ? { accountId } : {}) },
  )
}

// ---- Token access / refresh ----

async function resolveAccountId(userId: string, accountId?: string): Promise<string> {
  if (accountId) return accountId
  const account = await prisma.account.findFirst({
    where: { userId, provider: 'microsoft', syncEnabled: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (!account) {
    throw new AppError('SYNC_FAILED', 'Outlook is not connected.', 400, { provider: 'outlook' })
  }
  return account.id
}

async function getAccessToken(userId: string, accountId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId, provider: 'microsoft' },
    select: {
      access_token: true,
      refresh_token: true,
      expires_at: true,
      reauthRequired: true,
      reauthReason: true,
    },
  })

  if (!account?.refresh_token) {
    await markAccountReauthRequired(userId, accountId, 'missing_refresh_token')
    throw reauthError('missing_refresh_token', accountId)
  }

  if (account.reauthRequired) {
    throw reauthError((account.reauthReason as ProviderReauthReason) || 'refresh_failed', accountId)
  }

  const expiryMs = account.expires_at ? account.expires_at * 1000 : undefined
  const expiresSoon = !account.access_token || !expiryMs || expiryMs <= Date.now() + 60 * 1000

  if (!expiresSoon) {
    return account.access_token!
  }

  const result = await refreshMicrosoftToken(account.refresh_token)

  if (!result.ok) {
    if (result.status === 0 || result.status >= 500 || result.status === 429) {
      throw new AppError(
        'SYNC_TEMPORARY_ERROR',
        'Outlook is temporarily unavailable. Please try syncing again shortly.',
        503,
        { provider: 'outlook' },
      )
    }

    const mappedReason: ProviderReauthReason =
      result.errorCode === 'invalid_grant' ? 'invalid_grant' : 'refresh_failed'
    await markAccountReauthRequired(userId, accountId, mappedReason)
    console.error('[outlook] refresh token failed', {
      userId,
      reason: mappedReason,
      status: result.status,
      errorCode: result.errorCode,
    })
    throw reauthError(mappedReason, accountId)
  }

  if (!result.accessToken) {
    await markAccountReauthRequired(userId, accountId, 'refresh_failed')
    throw reauthError('refresh_failed', accountId)
  }

  await prisma.account.update({
    where: { id: accountId },
    data: {
      access_token: result.accessToken,
      expires_at:
        typeof result.expiresIn === 'number'
          ? Math.floor(Date.now() / 1000) + result.expiresIn
          : null,
      // Microsoft rotates refresh tokens — replace the stored one when a new
      // one is returned, keep the old one otherwise.
      ...(result.refreshToken ? { refresh_token: result.refreshToken } : {}),
      reauthRequired: false,
      reauthReason: null,
      reauthAt: null,
      reauthProvider: null,
    },
  })

  return result.accessToken
}

// ---- Message mapping ----

function formatAddress(addr: GraphEmailAddress | null | undefined): string {
  const email = addr?.emailAddress?.address || ''
  const name = addr?.emailAddress?.name || ''
  if (name && email) return `${name} <${email}>`
  return email || name
}

function joinAddresses(addrs: GraphEmailAddress[] | null | undefined): string {
  return (addrs || []).map(formatAddress).filter(Boolean).join(', ')
}

// Same HTML→text fallback shape as the Gmail client — only used when Graph
// ignores the Prefer: outlook.body-content-type="text" hint.
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function extractGraphBody(message: GraphMessage): { text: string; html: string | null } {
  const content = message.body?.content || ''
  if (!content) return { text: message.bodyPreview || '', html: null }
  if (message.body?.contentType === 'html') {
    return { text: htmlToText(content), html: content }
  }
  return { text: content, html: null }
}

function toEmailMessage(
  message: GraphMessage,
  account: { id: string; email: string | null }
): EmailMessage {
  const { text: bodyFull, html: bodyHtml } = extractGraphBody(message)

  // Informational only — deliberately none of these match the AI pipeline's
  // Gmail category map. Graph has no promotions/social taxonomy and Junk never
  // appears here (we only fetch the Inbox folder), so providerCategories stays
  // empty and every message goes through the rule pre-filter + AI as intended.
  const labels = [
    'INBOX',
    ...(message.isRead ? [] : ['UNREAD']),
    ...(message.importance === 'high' ? ['IMPORTANT'] : []),
  ]

  return {
    accountId: account.id,
    accountEmail: account.email ?? '',
    providerMessageId: message.id,
    threadId: message.conversationId || null,
    subject: message.subject || '(no subject)',
    sender: formatAddress(message.from),
    recipients: [joinAddresses(message.toRecipients), joinAddresses(message.ccRecipients)].filter(Boolean),
    bodyPreview: bodyFull.slice(0, 2000) || message.bodyPreview || '',
    bodyFull,
    bodyHtml,
    receivedAt: message.receivedDateTime ? new Date(message.receivedDateTime) : new Date(),
    labels,
    providerCategories: [],
    hasAttachments: !!message.hasAttachments,
  }
}

// ---- Outlook Provider Implementation ----

export const outlookProvider: EmailProvider = {
  name: 'outlook',
  accountProvider: 'microsoft',
  displayName: 'Outlook',

  async fetchNewEmails(userId: string, options?: FetchNewEmailsOptions): Promise<EmailMessage[]> {
    try {
      const accountId = await resolveAccountId(userId, options?.accountId)
      const account = await prisma.account.findFirst({
        where: { id: accountId, userId, provider: 'microsoft' },
        select: { id: true, email: true },
      })
      if (!account) {
        throw new AppError('SYNC_FAILED', 'Outlook is not connected.', 400, { provider: 'outlook' })
      }

      const accessToken = await getAccessToken(userId, accountId)

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

      const existingIds = new Set(
        (
          await prisma.email.findMany({
            where: { userId, accountId },
            select: { providerMessageId: true },
          })
        ).map((e) => e.providerMessageId)
      )

      // Caller may request fewer when the user's free-plan quota is nearly
      // exhausted, to avoid storing emails that will never be classified.
      const maxResults = Math.max(1, Math.min(options?.maxResults ?? PAGE_SIZE, 100))

      const params = new URLSearchParams({
        $top: String(PAGE_SIZE),
        $orderby: 'receivedDateTime desc',
        $filter: `receivedDateTime ge ${startDate.toISOString()}`,
        $select: MESSAGE_SELECT,
      })
      let nextUrl: string | undefined =
        `${GRAPH_BASE}/me/mailFolders/inbox/messages?${params.toString()}`

      const messages: EmailMessage[] = []
      let pagesFetched = 0

      while (nextUrl && pagesFetched < MAX_PAGES && messages.length < maxResults) {
        const page: GraphMessageListResponse = await graphFetch<GraphMessageListResponse>(
          nextUrl,
          accessToken,
          { Prefer: 'outlook.body-content-type="text"' }
        )
        pagesFetched += 1

        for (const message of page.value || []) {
          if (!message.id || existingIds.has(message.id)) continue
          messages.push(toEmailMessage(message, account))
          if (messages.length >= maxResults) break
        }

        nextUrl = page['@odata.nextLink']
      }

      await clearAccountReauthRequired(userId, accountId)
      return messages
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }

      if (isInvalidCredentialError(error)) {
        await markAccountReauthRequired(userId, options?.accountId, 'access_token_invalid')
        console.error('[outlook] provider auth invalid during fetch', { userId })
        throw reauthError('access_token_invalid', options?.accountId)
      }

      if (isTemporaryProviderError(error)) {
        throw new AppError(
          'SYNC_TEMPORARY_ERROR',
          'Outlook is temporarily unavailable. Please try syncing again shortly.',
          503,
          { provider: 'outlook' },
        )
      }

      console.error('[outlook] fetchNewEmails failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw new AppError('SYNC_FAILED', 'Failed to sync Outlook right now.', 500, { provider: 'outlook' })
    }
  },

  async previewCount(userId: string, { since, accountId }: { since: Date; accountId?: string }): Promise<{ quotaImpactCount: number; capped: boolean }> {
    try {
      const resolvedAccountId = await resolveAccountId(userId, accountId)
      const accessToken = await getAccessToken(userId, resolvedAccountId)

      // Page through ids and count exactly, capped at SOFT_CAP (same approach
      // as the Gmail provider). Unlike Gmail there is no category:primary
      // narrowing — providerCategories is always empty for Outlook, so every
      // inbox message can burn AI quota and counting them all is accurate.
      const SOFT_CAP = 500
      const params = new URLSearchParams({
        $top: '100',
        $filter: `receivedDateTime ge ${since.toISOString()}`,
        $select: 'id',
      })
      let nextUrl: string | undefined =
        `${GRAPH_BASE}/me/mailFolders/inbox/messages?${params.toString()}`
      let count = 0
      let capped = false

      while (nextUrl) {
        const page: GraphMessageListResponse = await graphFetch<GraphMessageListResponse>(nextUrl, accessToken)
        count += page.value?.length ?? 0
        nextUrl = page['@odata.nextLink']
        if (count >= SOFT_CAP) {
          capped = !!nextUrl
          break
        }
      }

      return { quotaImpactCount: count, capped }
    } catch (error) {
      if (error instanceof AppError) throw error

      if (isInvalidCredentialError(error)) {
        await markAccountReauthRequired(userId, accountId, 'access_token_invalid')
        throw reauthError('access_token_invalid', accountId)
      }

      if (isTemporaryProviderError(error)) {
        throw new AppError(
          'SYNC_TEMPORARY_ERROR',
          'Outlook is temporarily unavailable. Please try again shortly.',
          503,
          { provider: 'outlook' },
        )
      }

      console.error('[outlook] previewCount failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw new AppError('SYNC_FAILED', 'Failed to preview Outlook right now.', 500, { provider: 'outlook' })
    }
  },

  async disconnect(userId: string, accountId?: string): Promise<void> {
    // The Microsoft identity platform v2 has no public app-side endpoint to
    // revoke a single refresh token, so disconnect only clears stored tokens.
    const clearedTokenFields = {
      access_token: null,
      refresh_token: null,
      expires_at: null,
      syncEnabled: false,
      reauthRequired: false,
      reauthReason: null,
      reauthAt: null,
      reauthProvider: null,
    }

    if (accountId) {
      await prisma.account.update({
        where: { id: accountId },
        data: clearedTokenFields,
      })
    } else {
      await prisma.account.updateMany({
        where: { userId, provider: 'microsoft' },
        data: clearedTokenFields,
      })
    }

    // Only shut off user-level sync when no enabled account remains across
    // ANY provider — a still-connected Gmail account must keep syncing.
    // (Every Account row is an email-provider OAuth connection.)
    const remaining = await prisma.account.count({
      where: { userId, syncEnabled: true },
    })
    if (remaining === 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { syncEnabled: false, lastSyncAt: null },
      })
    }

    // Clear the user-level reauth flag only when Outlook set it — never wipe
    // a pending Gmail reauth banner. Never touches the user's gmail* fields.
    await prisma.user.updateMany({
      where: { id: userId, emailProviderReauthProvider: 'outlook' },
      data: {
        emailProviderReauthRequired: false,
        emailProviderReauthReason: null,
        emailProviderReauthAt: null,
        emailProviderReauthProvider: null,
      },
    })
  },
}

/**
 * Fetches the full body of a single Outlook message by its provider message ID.
 * Used by the retention restore flow to re-hydrate METADATA_ONLY emails.
 * Handles token refresh automatically via getAccessToken.
 */
export async function fetchOutlookMessageBody(
  userId: string,
  accountId: string | null,
  providerMessageId: string
): Promise<{ text: string; html: string | null }> {
  const resolvedAccountId = await resolveAccountId(userId, accountId ?? undefined)
  const accessToken = await getAccessToken(userId, resolvedAccountId)

  const message = await graphFetch<GraphMessage>(
    `${GRAPH_BASE}/me/messages/${encodeURIComponent(providerMessageId)}?$select=body,bodyPreview`,
    accessToken,
    { Prefer: 'outlook.body-content-type="text"' }
  )

  return extractGraphBody(message)
}
