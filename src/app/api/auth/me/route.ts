import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCurrentSessionContext } from '@/lib/auth-session'
import { errorFromException } from '@/lib/api-helpers'

export async function GET(request: NextRequest) {
  try {
    const context = await requireCurrentSessionContext()
    const includeDetails = request.nextUrl.searchParams.get('details') === 'full'

    if (!includeDetails) {
      return NextResponse.json({
        success: true,
        user: {
          id: context.user.id,
          email: context.user.email,
          name: context.user.name,
          isAdmin: context.user.isAdmin,
          currentSessionId: context.session.id,
        },
      })
    }

    const [user, googleAccount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: context.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          isAdmin: true,
          gmailEmail: true,
          syncStartDate: true,
          timezone: true,
          totpEnabled: true,
          manualReviewMode: true,
          emailProviderReauthRequired: true,
          emailProviderReauthReason: true,
          emailProviderReauthAt: true,
          emailProviderReauthProvider: true,
        },
      }),
      prisma.account.findFirst({
        where: { userId: context.user.id, provider: 'google' },
        select: { id: true },
      }),
    ])

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        gmailEmail: user.gmailEmail,
        syncStartDate: user.syncStartDate,
        timezone: user.timezone,
        totpEnabled: user.totpEnabled,
        manualReviewMode: user.manualReviewMode,
        emailProviderReauthRequired: user.emailProviderReauthRequired,
        emailProviderReauthReason: user.emailProviderReauthReason,
        emailProviderReauthAt: user.emailProviderReauthAt,
        emailProviderReauthProvider: user.emailProviderReauthProvider,
        googleAccount: googleAccount ? { email: user.gmailEmail ?? null } : null,
        currentSessionId: context.session.id,
      },
    })
  } catch (err) {
    console.error('[api/auth/me]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Failed to get current user', 500)
  }
}
