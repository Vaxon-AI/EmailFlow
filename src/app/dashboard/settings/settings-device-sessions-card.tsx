'use client'

import { formatDistanceToNow } from 'date-fns'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, LogOut, MonitorSmartphone } from 'lucide-react'
import { toast } from 'sonner'
import { showError } from '@/components/error-dialog'
import { CACHE_TIME } from '@/lib/query-cache'
import { getErrorMessage, mutateJson } from '@/lib/api-client'

export type DeviceSession = {
  id: string
  deviceName: string
  deviceType: string
  browser: string
  os: string
  ipAddress: string
  userAgent: string
  lastActiveAt: string
  expiresAt: string
  createdAt: string
  isCurrent: boolean
}

export function DeviceSessionsCard({
  currentSessionId,
  onLogoutCurrent,
}: {
  currentSessionId: string | null
  onLogoutCurrent: () => Promise<void>
}) {
  const queryClient = useQueryClient()

  const { data: sessionsRes, isLoading } = useQuery({
    queryKey: ['auth-sessions'],
    queryFn: async () => {
      const res = await fetch('/api/auth/sessions')
      const json = await res.json()
      if (!res.ok) throw new Error(getErrorMessage(json, 'Failed to load sessions'))
      return json
    },
    staleTime: CACHE_TIME.auth,
  })

  const sessions: DeviceSession[] = sessionsRes?.data?.sessions || []

  const revokeSessionMutation = useMutation({
    mutationFn: async (session: DeviceSession) => {
      await mutateJson(`/api/auth/sessions/${session.id}/revoke`, {
        fallbackMessage: 'Failed to sign out device',
      })
      return session
    },
    onSuccess: async (session) => {
      if (session.isCurrent || session.id === currentSessionId) {
        toast.success('Signed out from current device')
        await onLogoutCurrent()
        return
      }

      toast.success('Device signed out')
      queryClient.invalidateQueries({ queryKey: ['auth-sessions'] })
    },
    onError: (err: Error) => {
      showError(err.message || 'Failed to sign out device')
    },
  })

  const revokeOthersMutation = useMutation({
    mutationFn: () =>
      mutateJson<{ data?: { revokedCount?: number } }>('/api/auth/sessions/revoke-others', {
        fallbackMessage: 'Failed to sign out other devices',
      }),
    onSuccess: (json) => {
      const count = json?.data?.revokedCount ?? 0
      toast.success(count > 0 ? `Signed out ${count} other device${count === 1 ? '' : 's'}` : 'No other active devices')
      queryClient.invalidateQueries({ queryKey: ['auth-sessions'] })
    },
    onError: (err: Error) => {
      showError(err.message || 'Failed to sign out other devices')
    },
  })

  return (
    <Card className="border-white/80 bg-white/95 shadow-sm">
      <CardHeader >
        <CardTitle className="flex items-center gap-2 text-base">
          <MonitorSmartphone className="h-4 w-4 text-brand-700" />
          Browsers & Devices
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-gray-200/80 bg-gray-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-gray-900">Manage where your account stays signed in</p>
            <p className="text-sm text-gray-500">
              You can stay signed in on up to 3 browsers or devices. If you reach the limit, choose one here or during sign-in to sign out.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => revokeOthersMutation.mutate()}
            disabled={revokeOthersMutation.isPending || sessions.filter((session) => !session.isCurrent).length === 0}
            className="gap-2 self-start sm:self-auto"
          >
            {revokeOthersMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
            Sign out all other devices
          </Button>
        </div>

        <div className="space-y-3">
          {isLoading ? (
            <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
              Loading active sessions...
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
              No active sessions found.
            </div>
          ) : (
            sessions.map((session) => {
              const secondary = [session.browser, session.os].filter(Boolean).join(' · ') || 'Unknown environment'

              return (
                <div
                  key={session.id}
                  className="flex flex-col gap-4 rounded-2xl border border-gray-200/80 bg-white p-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{session.deviceName || 'Unknown device'}</p>
                      {session.isCurrent ? (
                        <Badge className="bg-brand-100 text-brand-700 hover:bg-brand-100">Current device</Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-gray-600">{secondary}</p>
                    <p className="text-xs text-gray-500">
                      Last active {formatDistanceToNow(new Date(session.lastActiveAt), { addSuffix: true })}
                    </p>
                    <p className="text-xs text-gray-400">
                      Signed in {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 self-start border-critical-100 text-critical-700 hover:bg-critical-50 hover:text-critical-700"
                    onClick={() => revokeSessionMutation.mutate(session)}
                    disabled={revokeSessionMutation.isPending}
                  >
                    {revokeSessionMutation.isPending && revokeSessionMutation.variables?.id === session.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LogOut className="h-3.5 w-3.5" />
                    )}
                    Sign out
                  </Button>
                </div>
              )
            })
          )}
        </div>
      </CardContent>
    </Card>
  )
}
