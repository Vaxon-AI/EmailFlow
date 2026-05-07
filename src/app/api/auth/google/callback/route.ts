import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-session'
import { createUserSession } from '@/lib/auth-sessions'
import { setSessionCookie } from '@/lib/auth-token'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// Returning users have already chosen a sync window — sending them through the
// "Set your sync range" dialog every login is annoying. Skip the dialog if any
// of these signal the user has been set up before:
//   - hasSeenSyncSetup explicitly true (clicked any modal action)
//   - syncStartDate set (user picked a window in Settings, bypassing modal)
//   - lastSyncAt set (any prior successful sync)
async function dashboardRedirectFor(userId: string): Promise<URL> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { hasSeenSyncSetup: true, syncStartDate: true, lastSyncAt: true },
  })
  const isSetUp = !!(u?.hasSeenSyncSetup || u?.syncStartDate || u?.lastSyncAt)
  const path = isSetUp ? '/dashboard' : '/dashboard?gmail_connected=1'
  return new URL(path, APP_URL)
}

export async function GET(req: NextRequest) {
  try {
    const [user, searchParams] = [await getCurrentUser(), req.nextUrl.searchParams]
    const code = searchParams.get('code')
    const error = searchParams.get('error')

    const errorBase = user ? '/dashboard' : '/auth/signup'

    if (error) {
      return NextResponse.redirect(
        new URL(`${errorBase}?gmail_error=${encodeURIComponent(error)}`, APP_URL)
      )
    }

    if (!code) {
      return NextResponse.redirect(new URL(`${errorBase}?gmail_error=missing_code`, APP_URL))
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
      return NextResponse.redirect(new URL(`${errorBase}?gmail_error=missing_google_env`, APP_URL))
    }

    // --- Token exchange ---
    const tokenController = new AbortController()
    const tokenTimeout = setTimeout(() => tokenController.abort(), 10_000)
    let tokenRes: Response
    try {
      tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: GOOGLE_REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
        signal: tokenController.signal,
      })
    } catch {
      return NextResponse.redirect(new URL(`${errorBase}?gmail_error=token_exchange_failed`, APP_URL))
    } finally {
      clearTimeout(tokenTimeout)
    }

    const tokenData = await tokenRes.json()

    if (!tokenRes.ok) {
      console.error('[google callback] token exchange failed:', tokenData)
      return NextResponse.redirect(new URL(`${errorBase}?gmail_error=token_exchange_failed`, APP_URL))
    }

    const accessToken = tokenData.access_token as string | undefined
    const refreshToken = tokenData.refresh_token as string | undefined
    const expiresIn = tokenData.expires_in as number | undefined

    if (!accessToken) {
      return NextResponse.redirect(new URL(`${errorBase}?gmail_error=missing_access_token`, APP_URL))
    }

    // --- Fetch Google profile ---
    const profileController = new AbortController()
    const profileTimeout = setTimeout(() => profileController.abort(), 10_000)
    let profileRes: Response
    try {
      profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: profileController.signal,
      })
    } catch {
      return NextResponse.redirect(new URL(`${errorBase}?gmail_error=userinfo_failed`, APP_URL))
    } finally {
      clearTimeout(profileTimeout)
    }

    const profileData = await profileRes.json()

    if (!profileRes.ok) {
      console.error('[google callback] failed to fetch user info:', profileData)
      return NextResponse.redirect(new URL(`${errorBase}?gmail_error=userinfo_failed`, APP_URL))
    }

    const gmailEmail = profileData.email as string | undefined
    // Google's stable account identifier — never changes even if user renames their account
    const providerAccountId = profileData.id as string | undefined
    const expiryDate = typeof expiresIn === 'number' ? new Date(Date.now() + expiresIn * 1000) : null
    // Account.expires_at stores Unix epoch seconds (Int? in schema)
    const expiresAtEpoch = typeof expiresIn === 'number' ? Math.floor(Date.now() / 1000) + expiresIn : null

    const gmailFields = {
      gmailAccessToken: accessToken,
      gmailConnected: true,
      syncEnabled: true,
      gmailTokenExpiry: expiryDate,
      emailProviderReauthRequired: false,
      emailProviderReauthReason: null,
      emailProviderReauthAt: null,
      emailProviderReauthProvider: 'gmail' as const,
      ...(gmailEmail ? { gmailEmail } : {}),
      ...(refreshToken ? { gmailRefreshToken: refreshToken } : {}),
    }

    const accountTokenFields = {
      access_token: accessToken,
      expires_at: expiresAtEpoch,
      ...(refreshToken ? { refresh_token: refreshToken } : {}),
      ...(gmailEmail ? { email: gmailEmail } : {}),
    }

    // ----------------------------------------------------------------
    // Path A: user is already logged in → connect Gmail to their account
    // ----------------------------------------------------------------
    if (user) {
      if (!providerAccountId) {
        return NextResponse.redirect(new URL('/dashboard?gmail_error=no_provider_id', APP_URL))
      }

      // Reject if this Google account is already bound to a *different* user
      const existingBinding = await prisma.account.findUnique({
        where: { provider_providerAccountId: { provider: 'google', providerAccountId } },
        select: { userId: true },
      })

      if (existingBinding && existingBinding.userId !== user.id) {
        return NextResponse.redirect(
          new URL('/dashboard?gmail_error=google_account_already_bound', APP_URL)
        )
      }

      await prisma.$transaction([
        prisma.user.update({ where: { id: user.id }, data: gmailFields }),
        prisma.account.upsert({
          where: { provider_providerAccountId: { provider: 'google', providerAccountId } },
          create: {
            userId: user.id,
            type: 'oauth',
            provider: 'google',
            providerAccountId,
            ...accountTokenFields,
          },
          update: accountTokenFields,
        }),
      ])

      return NextResponse.redirect(await dashboardRedirectFor(user.id))
    }

    // ----------------------------------------------------------------
    // Not logged in: sign in or sign up via Google OAuth
    // ----------------------------------------------------------------

    if (!gmailEmail) {
      return NextResponse.redirect(new URL('/auth/signup?gmail_error=no_email', APP_URL))
    }

    if (!providerAccountId) {
      return NextResponse.redirect(new URL('/auth/signup?gmail_error=no_provider_id', APP_URL))
    }

    let targetUserId: string

    // Case 1: Google account already bound → sign in directly
    const existingAccount = await prisma.account.findUnique({
      where: { provider_providerAccountId: { provider: 'google', providerAccountId } },
      select: { userId: true },
    })

    if (existingAccount) {
      targetUserId = existingAccount.userId

      await prisma.$transaction([
        prisma.user.update({ where: { id: targetUserId }, data: gmailFields }),
        prisma.account.update({
          where: { provider_providerAccountId: { provider: 'google', providerAccountId } },
          data: accountTokenFields,
        }),
      ])
    } else {
      // Case 2: No Account binding, but a User with this email already exists
      const emailUser = await prisma.user.findFirst({
        where: { OR: [{ gmailEmail }, { email: gmailEmail }] },
        select: { id: true },
      })

      if (emailUser) {
        targetUserId = emailUser.id

        await prisma.$transaction([
          prisma.user.update({ where: { id: targetUserId }, data: gmailFields }),
          prisma.account.create({
            data: {
              userId: targetUserId,
              type: 'oauth',
              provider: 'google',
              providerAccountId,
              ...accountTokenFields,
            },
          }),
        ])
      } else {
        // Case 3: Brand-new user — create User + Account atomically
        const newUser = await prisma.$transaction(async (tx) => {
          const u = await tx.user.create({
            data: {
              email: gmailEmail,
              name: (profileData.name as string | undefined) || gmailEmail.split('@')[0],
              image: (profileData.picture as string | undefined) ?? null,
              ...gmailFields,
            },
            select: { id: true },
          })

          await tx.account.create({
            data: {
              userId: u.id,
              type: 'oauth',
              provider: 'google',
              providerAccountId,
              ...accountTokenFields,
            },
          })

          return u
        })

        targetUserId = newUser.id
      }
    }

    const { rawToken } = await createUserSession({
      userId: targetUserId,
      userEmail: gmailEmail,
      request: req,
      sendNewDeviceAlert: false,
    })
    await setSessionCookie(rawToken)

    return NextResponse.redirect(await dashboardRedirectFor(targetUserId))
  } catch (err) {
    console.error('[google callback]', err)
    return NextResponse.redirect(new URL('/auth/signup?gmail_error=server_error', APP_URL))
  }
}
