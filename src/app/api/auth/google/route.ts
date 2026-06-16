import { NextRequest, NextResponse } from 'next/server'
import { getGoogleOAuthUrl } from '@/lib/google-oauth'

export async function GET(req: NextRequest) {
  const remember = req.nextUrl.searchParams.get('remember') !== '0'
  return NextResponse.redirect(getGoogleOAuthUrl(remember))
}
