'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/use-auth'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'
import { LogOut, Shield } from 'lucide-react'
import { CACHE_TIME } from '@/lib/query-cache'
import { RetentionPolicyCard } from '@/components/retention-policy-card'
import { SettingsPlanUsageCard, type QuotaStatus } from './settings-plan-usage-card'
import { SettingsSectionNav, type SettingsSection } from './settings-section-nav'
import { SettingsTimezoneCard } from './settings-timezone-card'
import { EmailSyncWindowCard } from './settings-email-sync-window-card'
import { ReviewModeCard } from './settings-review-mode-card'
import { PasswordCard } from './settings-password-card'
import { PreferencesCard } from './settings-preferences-card'
import { DeviceSessionsCard } from './settings-device-sessions-card'
import { TwoFactorCard } from './settings-two-factor-card'
import { DangerZoneCard } from './settings-danger-zone-card'
import { LinkAccountCard, type EmailAccount } from './settings-link-account-card'

type CurrentUser = {
  email?: string | null
  providerEmail?: string | null
  emailConnected?: boolean | null
  name?: string | null
  syncStartDate?: string | null
  timezone?: string | null
  totpEnabled?: boolean | null
  manualReviewMode?: boolean | null
  currentSessionId?: string | null
  emailProviderReauthRequired?: boolean | null
  emailProviderReauthReason?: string | null
  emailProviderReauthAt?: string | null
  emailProviderReauthProvider?: string | null
  googleAccount?: { email: string | null } | null
  emailAccounts?: EmailAccount[]
}

export default function SettingsPage() {
  const { user, logout } = useAuth()
  const queryClient = useQueryClient()
  const [activeSection, setActiveSection] = useState<SettingsSection>('account')

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => fetch('/api/stats').then((r) => r.json()),
    staleTime: CACHE_TIME.stats,
  })

  const { data: meRes } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => fetch('/api/auth/me?details=full').then((r) => r.json()),
    staleTime: CACHE_TIME.auth,
  })

  const { data: quotaRes } = useQuery<{ data: QuotaStatus }>({
    queryKey: ['quota'],
    queryFn: () => fetch('/api/settings/quota').then((r) => r.json()),
    staleTime: CACHE_TIME.stats,
  })
  const quota = quotaRes?.data

  const currentUser: CurrentUser | null = meRes?.user || meRes?.data || null
  const syncData = stats?.data?.sync
  const emailConnected = Boolean(syncData?.emailConnected)
  const providerReauthRequired = Boolean(
    currentUser?.emailProviderReauthRequired || syncData?.providerReauthRequired
  )
  const providerReauthProvider =
    currentUser?.emailProviderReauthProvider || syncData?.providerReauthProvider || 'gmail'

  function renderSectionContent() {
    switch (activeSection) {
      case 'account':
        return (
          <>
            <Card className="border-white/80 bg-white/95 shadow-sm">
              <CardContent className="flex flex-col gap-4 space-y-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-2xl font-semibold text-gray-900">{user?.name || 'Your account'}</p>
                  <p className="text-sm text-gray-500">{user?.email}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge variant="outline" className="border-brand-200 bg-brand-50 text-brand-700">
                      Workspace account
                    </Badge>
                    {providerReauthRequired ? (
                      <Badge variant="outline" className="border-warning-100 bg-warning-50 text-warning-700">
                        Reconnect required
                      </Badge>
                    ) : emailConnected ? (
                      <Badge className="bg-success-100 text-success hover:bg-success-100">Email connected</Badge>
                    ) : (
                      <Badge variant="outline">Email not connected</Badge>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => logout()} className="gap-2 self-start sm:self-auto">
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </Button>
              </CardContent>
            </Card>
            <PasswordCard />
            <SettingsPlanUsageCard plan={user?.plan} quota={quota} />
            <PreferencesCard />

            <SettingsTimezoneCard currentTimezone={currentUser?.timezone ?? null} />
            <RetentionPolicyCard />
          </>
        )
      case 'email':
        return (
          <>
            <ReviewModeCard manualReviewMode={currentUser?.manualReviewMode ?? true} />
            <LinkAccountCard
              accounts={currentUser?.emailAccounts ?? []}
              providerReauthRequired={providerReauthRequired}
              providerReauthProvider={providerReauthProvider}
              providerReauthAt={syncData?.providerReauthAt ?? null}
              lastSyncAt={syncData?.lastSyncAt ?? null}
            />
            <EmailSyncWindowCard syncStartDate={currentUser?.syncStartDate ?? null} />
          </>
        )
      case 'privacy':
        return (
          <>
            <TwoFactorCard
              totpEnabled={Boolean(currentUser?.totpEnabled)}
              onDisabled={() => queryClient.invalidateQueries({ queryKey: ['auth-me'] })}
            />
            <DeviceSessionsCard
              currentSessionId={currentUser?.currentSessionId || null}
              onLogoutCurrent={() => logout()}
            />
            <Card className="border-white/80 bg-white/95 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Shield className="h-4 w-4 text-brand-700" />
                  Security & Privacy
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-gray-200/70 text-sm leading-6 text-gray-500">
                  <div className="pb-2.5">
                    <span className="font-medium text-gray-700">Read-only access:</span>{' '}
                    EmailFlow AI reads email to classify threads and extract tasks. It cannot send or delete mail.
                  </div>
                  <div className="py-2.5">
                    <span className="font-medium text-gray-700">Processing:</span>{' '}
                    Email content is processed by AI providers for classification and summarization using the safeguards configured by the product.
                  </div>
                  <div className="pt-2.5">
                    <span className="font-medium text-gray-700">Disconnect anytime:</span>{' '}
                    Disconnecting your email account stops future sync runs. Existing tasks and stored records remain until you clear account data.
                  </div>
                </div>
              </CardContent>
            </Card>
            <DangerZoneCard onDeleted={() => logout()} />
          </>
        )
    }
  }

  return (
    <div className="relative">
      <SettingsSectionNav activeSection={activeSection} onSectionChange={setActiveSection} />
      <div className="mx-auto max-w-3xl space-y-5" style={{background: 'var(--background)', position: 'relative', zIndex: 1}}>
        <PageHeader
          title="Settings"
          description="Manage your account, email connections, and how the pipeline syncs your inbox."
        />
        {renderSectionContent()}
      </div>
    </div>
  )
}
