'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, MonitorSmartphone } from 'lucide-react'
import { toast } from 'sonner'

import { AuthShell } from '@/components/auth-shell'
import { InlineNotice } from '@/components/inline-notice'
import { StatePanel } from '@/components/state-panel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getErrorMessage, mutateJson } from '@/lib/api-client'
import { Input } from '@/components/ui/input'

type DeviceLimitDevice = {
  id: string
  deviceName: string
  browser: string
  os: string
  lastActiveAt: string
}

type DeviceLimitState = {
  token: string
  devices: DeviceLimitDevice[]
}

function VerifyTotpContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tempToken = searchParams.get('token') || ''

  const [totpCode, setTotpCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [deviceLimit, setDeviceLimit] = useState<DeviceLimitState | null>(null)
  const [revokingDeviceId, setRevokingDeviceId] = useState<string | null>(null)

  async function submitTotp() {
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/verify-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tempToken,
          totpCode,
        }),
      })

      const data = await res.json()

      if (!data.success) {
        if (data.code === 'DEVICE_LIMIT_REACHED' && data.deviceLimitToken && data.data?.devices?.length) {
          setDeviceLimit({ token: data.deviceLimitToken, devices: data.data.devices })
          return
        }
        setError(getErrorMessage(data, 'Verification failed'))
        return
      }

      if (data.isNewDevice) {
        toast.warning('New device detected. If this wasn’t you, please secure your account.')
      }

      router.push('/dashboard')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await submitTotp()
  }

  async function signOutDevice(sessionId: string) {
    if (!deviceLimit) return
    setRevokingDeviceId(sessionId)
    try {
      await mutateJson('/api/auth/device-limit/revoke', {
        body: { token: deviceLimit.token, sessionId },
        fallbackMessage: 'Failed to sign out device',
      })
      toast.success('Device signed out')
      setDeviceLimit(null)
      await submitTotp()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign out device')
    } finally {
      setRevokingDeviceId(null)
    }
  }

  return (
    <>
      <Dialog open={deviceLimit !== null} onOpenChange={(open) => { if (!open) setDeviceLimit(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Choose a device to sign out</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              You can stay signed in on up to 3 browsers or devices. Sign out one below to continue on this browser.
            </p>
            <div className="space-y-2">
              {deviceLimit?.devices.map((device) => (
                <button
                  key={device.id}
                  type="button"
                  onClick={() => signOutDevice(device.id)}
                  disabled={revokingDeviceId !== null}
                  className="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-brand-200 hover:bg-brand-50 disabled:opacity-60"
                >
                  <MonitorSmartphone className="h-4 w-4 shrink-0 text-brand-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{device.deviceName || 'Unknown device'}</p>
                    <p className="truncate text-xs text-gray-500">{[device.browser, device.os].filter(Boolean).join(' · ') || 'Unknown environment'}</p>
                    <p className="text-[11px] text-gray-400">Last active {new Date(device.lastActiveAt).toLocaleString()}</p>
                  </div>
                  {revokingDeviceId === device.id ? <Loader2 className="h-4 w-4 animate-spin text-brand-600" /> : null}
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <AuthShell
        title="Two-factor authentication"
        description="Enter the 6-digit code from your authenticator app."
        footer={
          <p className="text-center text-sm text-gray-500">
            <Link href="/auth/signin" className="text-brand-600 hover:underline">
              Back to sign in
            </Link>
          </p>
        }
      >
      {!tempToken ? (
        <StatePanel
          variant="danger"
          title="Missing verification token"
          description="Please sign in again to restart two-factor verification."
          action={
            <Link href="/auth/signin">
              <Button variant="outline" size="sm">Back to sign in</Button>
            </Link>
          }
        />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {error && <InlineNotice variant="error">{error}</InlineNotice>}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Authenticator code
            </label>
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="6-digit code"
              required
              className="h-10 px-3"
            />
          </div>

          <Button type="submit" disabled={loading} className="h-10 w-full gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Verify
          </Button>
        </form>
      )}
      </AuthShell>
    </>
  )
}

export default function VerifyTotpPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <StatePanel loading title="Loading verification" description="Preparing your sign-in session." />
        </div>
      }
    >
      <VerifyTotpContent />
    </Suspense>
  )
}
