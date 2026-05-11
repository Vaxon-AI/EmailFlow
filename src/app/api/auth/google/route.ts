import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getGoogleOAuthUrl } from '@/lib/google-oauth'

export async function GET(req: NextRequest) {
  const remember = req.nextUrl.searchParams.get('remember') !== '0'
  const cookieStore = await cookies()
  cookieStore.set('google_oauth_remember', remember ? '1' : '0', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300,
    path: '/api/auth/google/callback',
  })
  return NextResponse.redirect(getGoogleOAuthUrl())
}
