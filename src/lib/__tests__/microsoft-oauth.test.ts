import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  MICROSOFT_SCOPES,
  getMicrosoftOAuthUrl,
  exchangeMicrosoftCode,
  refreshMicrosoftToken,
  fetchMicrosoftProfile,
} from '../microsoft-oauth'
import { verifyOAuthStateToken } from '../auth-token'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  vi.stubEnv('MICROSOFT_CLIENT_ID', 'ms-client-id')
  vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'ms-client-secret')
  vi.stubEnv('MICROSOFT_REDIRECT_URI', 'http://localhost:3000/api/auth/microsoft/callback')
  vi.stubEnv('MICROSOFT_TENANT', '')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

function jsonResponse(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('getMicrosoftOAuthUrl', () => {
  it('builds the authorize URL with the common tenant by default', () => {
    const url = new URL(getMicrosoftOAuthUrl())
    expect(url.origin + url.pathname).toBe(
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
    )
    expect(url.searchParams.get('client_id')).toBe('ms-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/auth/microsoft/callback'
    )
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('response_mode')).toBe('query')
    expect(url.searchParams.get('prompt')).toBe('select_account')
    expect(url.searchParams.get('scope')).toBe(MICROSOFT_SCOPES)
    expect(MICROSOFT_SCOPES).toBe('openid profile email offline_access User.Read Mail.Read')
  })

  it('uses the MICROSOFT_TENANT env override', () => {
    vi.stubEnv('MICROSOFT_TENANT', 'my-tenant-id')
    const url = new URL(getMicrosoftOAuthUrl())
    expect(url.pathname).toBe('/my-tenant-id/oauth2/v2.0/authorize')
  })

  it('carries remember through the signed state token', () => {
    const url = new URL(getMicrosoftOAuthUrl(true))
    const state = url.searchParams.get('state')
    expect(verifyOAuthStateToken(state)).toEqual({ remember: true })

    const urlNoRemember = new URL(getMicrosoftOAuthUrl(false))
    expect(verifyOAuthStateToken(urlNoRemember.searchParams.get('state'))).toEqual({
      remember: false,
    })
  })

  it('throws when MICROSOFT_CLIENT_ID is missing', () => {
    vi.stubEnv('MICROSOFT_CLIENT_ID', '')
    expect(() => getMicrosoftOAuthUrl()).toThrow('Missing MICROSOFT_CLIENT_ID')
  })

  it('throws when MICROSOFT_REDIRECT_URI is missing', () => {
    vi.stubEnv('MICROSOFT_REDIRECT_URI', '')
    expect(() => getMicrosoftOAuthUrl()).toThrow('Missing MICROSOFT_REDIRECT_URI')
  })
})

describe('exchangeMicrosoftCode', () => {
  it('posts a form-encoded authorization_code grant to the tenant token endpoint', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(200, { access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600 })
    )

    const result = await exchangeMicrosoftCode('the-code')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/token')
    expect(init.method).toBe('POST')
    const body = init.body as URLSearchParams
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('the-code')
    expect(body.get('client_id')).toBe('ms-client-id')
    expect(body.get('client_secret')).toBe('ms-client-secret')
    expect(body.get('redirect_uri')).toBe('http://localhost:3000/api/auth/microsoft/callback')
    expect(body.get('scope')).toBe(MICROSOFT_SCOPES)

    expect(result).toEqual({
      ok: true,
      status: 200,
      accessToken: 'at-1',
      refreshToken: 'rt-1',
      expiresIn: 3600,
    })
  })

  it('maps an OAuth error body to errorCode without carrying the raw body', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(400, {
        error: 'invalid_grant',
        error_description: 'AADSTS70000: secret material that must not leak',
      })
    )

    const result = await exchangeMicrosoftCode('bad-code')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(400)
    expect(result.errorCode).toBe('invalid_grant')
    expect(JSON.stringify(result)).not.toContain('AADSTS70000')
  })

  it('returns a network_error result when fetch rejects', async () => {
    mockFetch.mockRejectedValue(new Error('boom'))
    const result = await exchangeMicrosoftCode('code')
    expect(result).toEqual({ ok: false, status: 0, errorCode: 'network_error' })
  })

  it('returns missing_env without calling fetch when env vars are absent', async () => {
    vi.stubEnv('MICROSOFT_CLIENT_SECRET', '')
    const result = await exchangeMicrosoftCode('code')
    expect(result).toEqual({ ok: false, status: 0, errorCode: 'missing_env' })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('refreshMicrosoftToken', () => {
  it('posts a refresh_token grant and returns the rotated refresh token', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(200, { access_token: 'at-2', refresh_token: 'rt-rotated', expires_in: 3600 })
    )

    const result = await refreshMicrosoftToken('rt-old')

    const [, init] = mockFetch.mock.calls[0]
    const body = init.body as URLSearchParams
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('rt-old')
    expect(result.refreshToken).toBe('rt-rotated')
  })

  it('classifies 5xx responses via status', async () => {
    mockFetch.mockResolvedValue(new Response('bad gateway', { status: 502 }))
    const result = await refreshMicrosoftToken('rt')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(502)
  })
})

describe('fetchMicrosoftProfile', () => {
  it('requests the Graph /me endpoint with the bearer token and $select', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(200, {
        id: 'ms-user-1',
        displayName: 'Alice',
        mail: 'alice@outlook.com',
        userPrincipalName: 'alice@outlook.com',
      })
    )

    const result = await fetchMicrosoftProfile('at-1')

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe(
      'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName'
    )
    expect(init.headers.Authorization).toBe('Bearer at-1')
    expect(result.ok).toBe(true)
    expect(result.profile?.id).toBe('ms-user-1')
    expect(result.profile?.mail).toBe('alice@outlook.com')
  })

  it('returns ok false with the status on failure', async () => {
    mockFetch.mockResolvedValue(new Response('unauthorized', { status: 401 }))
    const result = await fetchMicrosoftProfile('expired')
    expect(result).toEqual({ ok: false, status: 401 })
  })
})
