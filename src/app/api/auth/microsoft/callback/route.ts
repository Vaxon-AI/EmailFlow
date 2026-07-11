import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { getCurrentUser } from '@/lib/auth-sessions'
import { createUserSession } from '@/lib/auth-sessions'
import { setSessionCookie, verifyOAuthStateToken } from '@/lib/auth-token'
import { isAppError } from '@/lib/app-errors'
import { exchangeMicrosoftCode, fetchMicrosoftProfile } from '@/lib/microsoft-oauth'
import {
  getInheritedQuotaForEmail,
  mergeGmailLedgerIntoUser,
} from '@/repositories/quota-ledger-repo'

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET
const MICROSOFT_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// Returning users have already chosen a sync window — sending them through the
// "Set your sync range" dialog every login is annoying. Skip the dialog if any
// of these signal the user has been set up before (mirrors the Google callback;
// the gmail_connected param is the internal flag the dashboard already reads
// to open the first-sync setup dialog, regardless of provider).
async function dashboardRedirectFor(userId: string): Promise<URL> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { hasSeenSyncSetup: true, syncStartDate: true, lastSyncAt: true },
  })
  const isSetUp = !!(u?.hasSeenSyncSetup || u?.syncStartDate || u?.lastSyncAt)
  const path = isSetUp ? '/dashboard' : '/dashboard?gmail_connected=1'
  return new URL(path, APP_URL)
}

// Unlike the Google callback, no user-level token copy exists for Microsoft —
// tokens live only on the Account row. The user-level reauth flag is cleared
// only when it was set by Outlook: clearing unconditionally would wipe a
// pending Gmail reauth banner.
async function applyUserSyncFields(tx: Prisma.TransactionClient, userId: string) {
  await tx.user.update({ where: { id: userId }, data: { syncEnabled: true } })
  await tx.user.updateMany({
    where: { id: userId, emailProviderReauthProvider: 'outlook' },
    data: {
      emailProviderReauthRequired: false,
      emailProviderReauthReason: null,
      emailProviderReauthAt: null,
    },
  })
}

export async function GET(req: NextRequest) {
  try {
    // remember is carried through the OAuth round-trip via the signed `state`
    // param (echoed back by Microsoft), not a cross-site cookie. Missing/invalid
    // state → treat as not-remembered (legitimate flows always have valid state).
    const remember = verifyOAuthStateToken(req.nextUrl.searchParams.get('state'))?.remember ?? false

    const [user, searchParams] = [await getCurrentUser(), req.nextUrl.searchParams]
    const code = searchParams.get('code')
    const error = searchParams.get('error')

    const errorBase = user ? '/dashboard/settings' : '/auth/signup'

    if (error) {
      return NextResponse.redirect(
        new URL(`${errorBase}?outlook_error=${encodeURIComponent(error)}`, APP_URL)
      )
    }

    if (!code) {
      return NextResponse.redirect(new URL(`${errorBase}?outlook_error=missing_code`, APP_URL))
    }

    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !MICROSOFT_REDIRECT_URI) {
      return NextResponse.redirect(new URL(`${errorBase}?outlook_error=missing_microsoft_env`, APP_URL))
    }

    // --- Token exchange ---
    const tokenResult = await exchangeMicrosoftCode(code)

    if (!tokenResult.ok) {
      console.error('[microsoft callback] token exchange failed:', {
        status: tokenResult.status,
        errorCode: tokenResult.errorCode,
      })
      return NextResponse.redirect(new URL(`${errorBase}?outlook_error=token_exchange_failed`, APP_URL))
    }

    const accessToken = tokenResult.accessToken
    const refreshToken = tokenResult.refreshToken
    const expiresIn = tokenResult.expiresIn

    if (!accessToken) {
      return NextResponse.redirect(new URL(`${errorBase}?outlook_error=missing_access_token`, APP_URL))
    }

    // --- Fetch Microsoft Graph profile ---
    const profileResult = await fetchMicrosoftProfile(accessToken)

    if (!profileResult.ok || !profileResult.profile) {
      console.error('[microsoft callback] failed to fetch user info:', {
        status: profileResult.status,
      })
      return NextResponse.redirect(new URL(`${errorBase}?outlook_error=userinfo_failed`, APP_URL))
    }

    const profile = profileResult.profile
    // Personal accounts often have `mail` unset — userPrincipalName is the fallback
    const msEmail = profile.mail || profile.userPrincipalName || undefined
    // Microsoft's stable account identifier — never changes even if user renames their account
    const providerAccountId = profile.id
    // Account.expires_at stores Unix epoch seconds (Int? in schema)
    const expiresAtEpoch =
      typeof expiresIn === 'number' ? Math.floor(Date.now() / 1000) + expiresIn : null

    const accountTokenFields = {
      access_token: accessToken,
      expires_at: expiresAtEpoch,
      syncEnabled: true,
      reauthRequired: false,
      reauthReason: null,
      reauthAt: null,
      reauthProvider: null,
      ...(refreshToken ? { refresh_token: refreshToken } : {}),
      ...(msEmail ? { email: msEmail } : {}),
    }

    // ----------------------------------------------------------------
    // Path A: user is already logged in → connect this email provider to their account
    // ----------------------------------------------------------------
    if (user) {
      if (!providerAccountId) {
        return NextResponse.redirect(new URL('/dashboard/settings?outlook_error=no_provider_id', APP_URL))
      }

      // Reject if this email is already registered to a *different* EmailFlow user
      if (msEmail) {
        const emailOwner = await prisma.user.findFirst({
          where: { email: msEmail },
          select: { id: true },
        })
        if (emailOwner && emailOwner.id !== user.id) {
          return NextResponse.redirect(
            new URL('/dashboard/settings?outlook_error=email_already_registered', APP_URL)
          )
        }
      }

      // Reject if this Microsoft account is already bound to a *different* user
      const existingBinding = await prisma.account.findUnique({
        where: { provider_providerAccountId: { provider: 'microsoft', providerAccountId } },
        select: { userId: true },
      })

      if (existingBinding && existingBinding.userId !== user.id) {
        return NextResponse.redirect(
          new URL('/dashboard/settings?outlook_error=microsoft_account_already_bound', APP_URL)
        )
      }

      await prisma.$transaction(async (tx) => {
        await applyUserSyncFields(tx, user.id)
        await tx.account.upsert({
          where: { provider_providerAccountId: { provider: 'microsoft', providerAccountId } },
          create: {
            userId: user.id,
            type: 'oauth',
            provider: 'microsoft',
            providerAccountId,
            ...accountTokenFields,
          },
          update: accountTokenFields,
        })
        if (msEmail) {
          await mergeGmailLedgerIntoUser(user.id, msEmail, tx)
        }
      })

      return NextResponse.redirect(await dashboardRedirectFor(user.id))
    }

    // ----------------------------------------------------------------
    // Not logged in: sign in or sign up via Microsoft OAuth
    // ----------------------------------------------------------------

    if (!msEmail) {
      return NextResponse.redirect(new URL('/auth/signup?outlook_error=no_email', APP_URL))
    }

    if (!providerAccountId) {
      return NextResponse.redirect(new URL('/auth/signup?outlook_error=no_provider_id', APP_URL))
    }

    let targetUserId: string

    // Case 1: Microsoft account already bound → sign in directly
    const existingAccount = await prisma.account.findUnique({
      where: { provider_providerAccountId: { provider: 'microsoft', providerAccountId } },
      select: { userId: true },
    })

    if (existingAccount) {
      targetUserId = existingAccount.userId
      const boundUserId = targetUserId

      await prisma.$transaction(async (tx) => {
        await applyUserSyncFields(tx, boundUserId)
        await tx.account.update({
          where: { provider_providerAccountId: { provider: 'microsoft', providerAccountId } },
          data: accountTokenFields,
        })
        await mergeGmailLedgerIntoUser(boundUserId, msEmail, tx)
      })
    } else {
      // Case 2: No Account binding, but a User with this email already exists
      const emailUser = await prisma.user.findFirst({
        where: { email: msEmail },
        select: { id: true },
      })

      if (emailUser) {
        targetUserId = emailUser.id
        const boundUserId = targetUserId

        await prisma.$transaction(async (tx) => {
          await applyUserSyncFields(tx, boundUserId)
          await tx.account.create({
            data: {
              userId: boundUserId,
              type: 'oauth',
              provider: 'microsoft',
              providerAccountId,
              ...accountTokenFields,
            },
          })
          await mergeGmailLedgerIntoUser(boundUserId, msEmail, tx)
        })
      } else {
        // Case 3: Brand-new user — create User + Account atomically. Inherit any
        // ledger entry for this email so a deleted-then-rejoining user does not
        // get a fresh free-tier window.
        const inherited = await getInheritedQuotaForEmail(msEmail, 'email')
        const newUser = await prisma.$transaction(async (tx) => {
          const u = await tx.user.create({
            data: {
              email: msEmail,
              name: profile.displayName || msEmail.split('@')[0],
              image: null,
              classifyUsed: inherited.classifyUsed,
              extractUsed: inherited.extractUsed,
              pasteTextUsed: inherited.pasteTextUsed,
              quotaResetAt: inherited.quotaResetAt,
              syncEnabled: true,
            },
            select: { id: true },
          })

          await tx.account.create({
            data: {
              userId: u.id,
              type: 'oauth',
              provider: 'microsoft',
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
      userEmail: msEmail,
      remember,
      request: req,
      sendNewDeviceAlert: false,
    })
    await setSessionCookie(rawToken, remember)

    return NextResponse.redirect(await dashboardRedirectFor(targetUserId))
  } catch (err) {
    if (isAppError(err) && err.code === 'DEVICE_LIMIT_REACHED') {
      return NextResponse.redirect(new URL('/auth/signin?reason=DEVICE_LIMIT_REACHED', APP_URL))
    }
    console.error('[microsoft callback]', err)
    return NextResponse.redirect(new URL('/auth/signup?outlook_error=server_error', APP_URL))
  }
}
