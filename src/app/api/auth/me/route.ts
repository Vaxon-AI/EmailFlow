import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentSessionContext } from '@/lib/auth-sessions'
import { errorFromException, error } from '@/lib/api-helpers'
import { findFullProfile } from '@/repositories/user-repo'

// Note: success responses use a non-standard `user` top-level field instead of
// the standard success() helper because the frontend (use-auth, settings page)
// reads `json.user` directly. See src/lib/use-auth.ts:35.

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
          manualReviewMode: context.user.manualReviewMode,
          plan: context.user.plan,
          currentSessionId: context.session.id,
        },
      })
    }

    const profile = await findFullProfile(context.user.id)
    if (!profile) {
      return error('NOT_FOUND', 'User not found', 404)
    }
    const { user, googleAccounts } = profile

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        providerEmail: googleAccounts[0]?.email ?? null,
        emailConnected: googleAccounts.some((account) => account.syncEnabled),
        syncStartDate: user.syncStartDate,
        timezone: user.timezone,
        totpEnabled: user.totpEnabled,
        manualReviewMode: user.manualReviewMode,
        emailProviderReauthRequired: user.emailProviderReauthRequired,
        emailProviderReauthReason: user.emailProviderReauthReason,
        emailProviderReauthAt: user.emailProviderReauthAt,
        emailProviderReauthProvider: user.emailProviderReauthProvider,
        googleAccount: googleAccounts[0] ? { email: googleAccounts[0].email ?? null } : null,
        emailAccounts: googleAccounts.map((account) => ({
          id: account.id,
          provider: account.provider,
          email: account.email,
          syncEnabled: account.syncEnabled,
          lastSyncAt: account.lastSyncAt,
          reauthRequired: account.reauthRequired,
          reauthReason: account.reauthReason,
          reauthAt: account.reauthAt,
          reauthProvider: account.reauthProvider,
        })),
        currentSessionId: context.session.id,
      },
    })
  } catch (err) {
    console.error('[api/auth/me]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Failed to get current user', 500)
  }
}
