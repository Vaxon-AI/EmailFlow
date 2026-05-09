'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

export default function TotpSetupPage() {
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [token, setToken] = useState('')
  const [userId, setUserId] = useState('')
  const [verifyResult, setVerifyResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadMe() {
      try {
        const res = await fetch('/api/auth/me')
        const data = await res.json()

        if (data.success) {
          setUserId(data.data.userId)
        } else {
          setError(data.error || 'No logged-in user found')
        }
      } catch {
        setError('Failed to load current user')
      }
    }

    loadMe()
  }, [])

  async function handleGenerate() {
    setLoading(true)
    setError('')
    setVerifyResult('')
    setToken('')

    try {
      const res = await fetch('/api/auth/totp/setup', {
        method: 'POST',
      })

      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Failed to generate QR code')
        return
      }

      setQrCode(data.data.qrCodeDataUrl)
      setSecret(data.data.secret)
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify() {
    setVerifying(true)
    setError('')
    setVerifyResult('')

    try {
      const res = await fetch('/api/auth/totp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          secret,
        }),
      })

      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Failed to verify code')
        return
      }

      if (data.data.isValid) {
        if (!userId) {
          setError('No logged-in user found')
          return
        }

        const enableRes = await fetch('/api/auth/totp/enable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            secret,
          }),
        })

        const enableData = await enableRes.json()

        if (!enableData.success) {
          setError(enableData.error || 'Failed to enable 2FA')
          return
        }

        setVerifyResult('2FA enabled successfully')
      } else {
        setVerifyResult('Invalid code')
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-xl font-bold text-gray-900">Set up Authenticator</h1>
        <p className="mb-4 text-sm text-gray-500">
          First generate a QR code, then scan it with your authenticator app.
        </p>

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="mb-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? 'Generating...' : 'Generate QR Code'}
        </button>

        {error && (
          <div className="mb-4 rounded-lg bg-critical-50 px-4 py-3 text-sm text-critical">
            {error}
          </div>
        )}

        {qrCode && (
          <div className="space-y-4">
            <Image
              src={qrCode}
              alt="TOTP QR Code"
              width={256}
              height={256}
              className="mx-auto h-64 w-64 rounded-lg border"
              unoptimized
            />

            <div>
              <p className="text-sm font-medium text-gray-700">Secret:</p>
              <p className="break-all rounded bg-gray-100 p-2 text-sm text-gray-800">
                {secret}
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Enter 6-digit code
              </label>
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456"
                className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <button
              onClick={handleVerify}
              disabled={verifying || !token || !secret}
              className="w-full rounded-lg bg-success px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {verifying ? 'Verifying...' : 'Verify Code'}
            </button>

            {verifyResult && (
              <div className="rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800">
                {verifyResult}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
