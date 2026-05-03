'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export const SESSION_401_EVENT = 'api:session-expired'

export function SessionExpiredWatcher() {
  const router = useRouter()
  const activeToastId = useRef<string | number | null>(null)

  useEffect(() => {
    function handleSessionExpired() {
      // Already on an auth page — no toast needed
      if (window.location.pathname.startsWith('/auth/')) return
      // Toast is already visible
      if (activeToastId.current !== null) return

      const id = toast.error('Session expired. Please sign in again.', {
        duration: Infinity,
        action: {
          label: 'Sign in',
          onClick: () => {
            activeToastId.current = null
            router.push('/auth/signin')
          },
        },
        onDismiss: () => {
          activeToastId.current = null
        },
      })
      activeToastId.current = id
    }

    window.addEventListener(SESSION_401_EVENT, handleSessionExpired)
    return () => window.removeEventListener(SESSION_401_EVENT, handleSessionExpired)
  }, [router])

  return null
}
