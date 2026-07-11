import { NextRequest, NextResponse } from 'next/server'
import { getMicrosoftOAuthUrl } from '@/lib/microsoft-oauth'

export async function GET(req: NextRequest) {
  const remember = req.nextUrl.searchParams.get('remember') !== '0'
  return NextResponse.redirect(getMicrosoftOAuthUrl(remember))
}
