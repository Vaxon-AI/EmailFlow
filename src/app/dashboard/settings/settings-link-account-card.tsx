'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InlineNotice } from '@/components/inline-notice'
import { KeyRound, Loader2, Mail, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'
import { mutateJson } from '@/lib/api-client'
import { getEmailProviderAccountLabel, getEmailProviderLabel } from '@/lib/email-provider-labels'

export type EmailAccount = {
  id: string
  provider: string
  email: string | null
  syncEnabled: boolean
  lastSyncAt: string | null
  reauthRequired: boolean
  reauthReason: string | null
  reauthAt: string | null
  reauthProvider: string | null
}

export function LinkAccountCard({
  accounts,
  providerReauthRequired,
  providerReauthProvider,
  providerReauthAt,
  lastSyncAt,
}: {
  accounts: EmailAccount[]
  providerReauthRequired: boolean
  providerReauthProvider: string
  providerReauthAt: string | null
  lastSyncAt: string | null
}) {
  const queryClient = useQueryClient()
  const bound = accounts.length > 0

  const disconnect = useMutation({
    mutationFn: (accountId: string) =>
      mutateJson('/api/auth/google/disconnect', {
        body: { accountId },
        fallbackMessage: 'Disconnect failed',
      }),
    onSuccess: () => {
      toast.success('Google account disconnected')
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      queryClient.invalidateQueries({ queryKey: ['auth-me'] })
    },
    onError: (err: Error) => {
      showError(err.message || 'Failed to disconnect Google account')
    },
  })

  return (
    <Card className="border-white/80 bg-white/95 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-brand-700" />
          Email Connections
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-gray-200/80 bg-gray-50/70 p-4">
          <div className="flex flex-col gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-900">Connected inboxes</p>
                <Badge
                  variant={bound ? 'default' : 'outline'}
                  className={bound ? 'bg-success-100 text-success hover:bg-success-100' : ''}
                >
                  {bound ? `${accounts.length} connected` : 'None connected'}
                </Badge>
                {bound && accounts.some((account) => account.reauthRequired) && (
                  <Badge
                    variant="default"
                    className="bg-warning-100 text-warning-700 hover:bg-warning-100"
                  >
                    Reconnect required
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-600">Connect one or more email accounts. EmailFlow uses read-only access and keeps each email connection separate for sync and filtering.</p>
            </div>

            {accounts.length > 0 ? (
              <div className="space-y-2">
                {accounts.map((account) => {
                  const reauthRequired = account.reauthRequired || (providerReauthRequired && accounts.length === 1)
                  const syncedAt = account.lastSyncAt || lastSyncAt
                  return (
                    <div key={account.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="border-brand-200 bg-brand-50 text-brand-700">
                            {getEmailProviderLabel(account.provider)}
                          </Badge>
                          <span className="truncate text-sm font-medium text-gray-900">{account.email || getEmailProviderAccountLabel(account.provider)}</span>
                          <Badge
                            variant={reauthRequired ? 'default' : account.syncEnabled ? 'outline' : 'outline'}
                            className={reauthRequired ? 'bg-warning-100 text-warning-700 hover:bg-warning-100' : account.syncEnabled ? 'border-success-100 bg-success-50 text-success' : ''}
                          >
                            {reauthRequired ? 'Reconnect required' : account.syncEnabled ? 'Sync enabled' : 'Sync off'}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-400">
                          {reauthRequired
                            ? `Last valid connection: ${account.reauthAt || providerReauthAt ? new Date(account.reauthAt || providerReauthAt || '').toLocaleString() : 'unknown'}`
                            : syncedAt
                              ? `Last synced ${new Date(syncedAt).toLocaleString()}`
                              : 'Connection is ready. Your next sync will use the current window below.'}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {reauthRequired ? (
                          <Button
                            size="sm"
                            className="gap-2"
                            onClick={() => { window.location.href = '/api/auth/google' }}
                          >
                            <Mail className="h-3.5 w-3.5" />
                            Reconnect
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 border-critical-100 text-critical-700 hover:bg-critical-50 hover:text-critical-700"
                          onClick={() => disconnect.mutate(account.id)}
                          disabled={disconnect.isPending}
                        >
                          {disconnect.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Unplug className="h-3.5 w-3.5" />
                          )}
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-5 text-sm text-gray-500">
                No email accounts connected yet.
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <a href="/api/auth/google" className="self-start">
                <Button size="sm" className="gap-2">
                  <KeyRound className="h-3.5 w-3.5" />
                  Add email account
                </Button>
              </a>
              <Button size="sm" variant="outline" disabled className="gap-2">
                Outlook coming soon
              </Button>
            </div>
          </div>
        </div>

        {(providerReauthRequired || accounts.some((account) => account.reauthRequired)) && (
          <InlineNotice variant="warning">
            <p className="text-sm">
              Your {getEmailProviderLabel(providerReauthProvider)} connection can no longer refresh access.
              Reconnect it, then run sync again.
            </p>
          </InlineNotice>
        )}

        <InlineNotice variant="info">
          <p className="text-sm">
            Google is available now. Outlook and additional providers can use this same account list when they are added.
          </p>
        </InlineNotice>
      </CardContent>
    </Card>
  )
}
