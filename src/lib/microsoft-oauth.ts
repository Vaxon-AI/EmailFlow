import { createOAuthStateToken } from '@/lib/auth-token'

// ============================================================
// Microsoft OAuth helper (Microsoft identity platform v2.0)
// Fully separate from google-oauth.ts. Token exchange/refresh
// return result objects instead of throwing so callers keep a
// flat redirect-on-error flow. Never log or expose tokens.
// ============================================================

export const MICROSOFT_SCOPES = 'openid profile email offline_access User.Read Mail.Read'

const GRAPH_PROFILE_URL =
  'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName'

const FETCH_TIMEOUT_MS = 10_000

function getTenant() {
  return process.env.MICROSOFT_TENANT || 'common'
}

function getTokenEndpoint() {
  return `https://login.microsoftonline.com/${getTenant()}/oauth2/v2.0/token`
}

export function getMicrosoftOAuthUrl(remember = false) {
  const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID
  const MICROSOFT_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI

  if (!MICROSOFT_CLIENT_ID) {
    throw new Error('Missing MICROSOFT_CLIENT_ID')
  }

  if (!MICROSOFT_REDIRECT_URI) {
    throw new Error('Missing MICROSOFT_REDIRECT_URI')
  }

  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    redirect_uri: MICROSOFT_REDIRECT_URI,
    response_type: 'code',
    response_mode: 'query',
    prompt: 'select_account',
    state: createOAuthStateToken(remember),
    scope: MICROSOFT_SCOPES,
  })

  return `https://login.microsoftonline.com/${getTenant()}/oauth2/v2.0/authorize?${params.toString()}`
}

export interface MicrosoftTokenResult {
  ok: boolean
  status: number
  accessToken?: string
  refreshToken?: string
  expiresIn?: number
  /** OAuth error code from the response body (e.g. 'invalid_grant'). Never raw body/tokens. */
  errorCode?: string
}

async function requestMicrosoftToken(body: URLSearchParams): Promise<MicrosoftTokenResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(getTokenEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    })
  } catch {
    return { ok: false, status: 0, errorCode: 'network_error' }
  } finally {
    clearTimeout(timeout)
  }

  let data: Record<string, unknown> = {}
  try {
    data = await res.json()
  } catch {
    // Non-JSON error body — status alone is enough for classification
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      errorCode: typeof data.error === 'string' ? data.error : undefined,
    }
  }

  const accessToken = typeof data.access_token === 'string' ? data.access_token : undefined
  return {
    ok: true,
    status: res.status,
    accessToken,
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
    expiresIn: typeof data.expires_in === 'number' ? data.expires_in : undefined,
  }
}

export async function exchangeMicrosoftCode(code: string): Promise<MicrosoftTokenResult> {
  const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID
  const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET
  const MICROSOFT_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI

  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !MICROSOFT_REDIRECT_URI) {
    return { ok: false, status: 0, errorCode: 'missing_env' }
  }

  return requestMicrosoftToken(
    new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      code,
      redirect_uri: MICROSOFT_REDIRECT_URI,
      grant_type: 'authorization_code',
      scope: MICROSOFT_SCOPES,
    })
  )
}

export async function refreshMicrosoftToken(refreshToken: string): Promise<MicrosoftTokenResult> {
  const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID
  const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET

  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
    return { ok: false, status: 0, errorCode: 'missing_env' }
  }

  return requestMicrosoftToken(
    new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: MICROSOFT_SCOPES,
    })
  )
}

export interface MicrosoftProfile {
  id: string
  displayName?: string | null
  mail?: string | null
  userPrincipalName?: string | null
}

export async function fetchMicrosoftProfile(
  accessToken: string
): Promise<{ ok: boolean; status: number; profile?: MicrosoftProfile }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(GRAPH_PROFILE_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
  } catch {
    return { ok: false, status: 0 }
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    return { ok: false, status: res.status }
  }

  const profile = (await res.json()) as MicrosoftProfile
  return { ok: true, status: res.status, profile }
}
