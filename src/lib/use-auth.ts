'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect } from 'react'
import { ApiClientError, isSessionFailureCode, readApiClientError } from '@/lib/api-client'
import { CACHE_TIME } from '@/lib/query-cache'

interface User {
  id: string
  email: string
  name: string
  isAdmin: boolean
  manualReviewMode: boolean
  plan: string
}

export function useAuth() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const clearAuthState = useCallback((reason?: string) => {
    queryClient.clear()
    router.replace(reason ? `/auth/signin?reason=${encodeURIComponent(reason)}` : '/auth/signin')
  }, [queryClient, router])

  const { data, status, error } = useQuery({
    queryKey: ['auth-user'],
    queryFn: async (): Promise<User | null> => {
      const res = await fetch('/api/auth/me')
      if (!res.ok) {
        throw await readApiClientError(res)
      }
      const json = await res.json()
      return json.user || null
    },
    retry: false,
    staleTime: CACHE_TIME.auth,
  })

  useEffect(() => {
    if (!(error instanceof ApiClientError)) return
    if (!isSessionFailureCode(error.code)) return
    clearAuthState(error.code)
  }, [clearAuthState, error])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    clearAuthState()
  }, [clearAuthState])

  return {
    user: data || null,
    isLoading: status === 'pending',
    isAuthenticated: !!data,
    logout,
  }
}
