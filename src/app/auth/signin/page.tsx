import { Suspense } from 'react'
import { redirect } from 'next/navigation'

import { StatePanel } from '@/components/state-panel'
import { getCurrentUser } from '@/lib/auth-sessions'

import { SignInContent } from './sign-in-content'

export const dynamic = 'force-dynamic'

export default async function SignInPage() {
  const user = await getCurrentUser()
  if (user) {
    redirect('/dashboard')
  }

  return (
    <Suspense
      fallback={
        <div className="p-6">
          <StatePanel loading title="Loading sign in" description="Preparing your account access." />
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  )
}
