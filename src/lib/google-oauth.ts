import { createOAuthStateToken } from '@/lib/auth-token'

export function getGoogleOAuthUrl(remember = false) {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI

  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Missing GOOGLE_CLIENT_ID')
  }

  if (!GOOGLE_REDIRECT_URI) {
    throw new Error('Missing GOOGLE_REDIRECT_URI')
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    state: createOAuthStateToken(remember),
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.readonly',
    ].join(' '),
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}