'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { CACHE_TIME } from '@/lib/query-cache'
import { mutateJson } from '@/lib/api-client'
import { PersonalisationChipGroup } from '@/components/personalisation-chips'
import {
  ONBOARDING_FOCUS_LIMIT,
  ONBOARDING_FOCUS_OPTIONS,
  ONBOARDING_PURPOSE_LIMIT,
  ONBOARDING_PURPOSE_OPTIONS,
  ONBOARDING_ROLE_LIMIT,
  ONBOARDING_ROLE_OPTIONS,
  toggleChipValue,
} from '@/lib/onboarding-profile'

type PreferencesDraft = {
  role: string[]
  purpose: string[]
  focusAreas: string[]
}

const EMPTY_DRAFT: PreferencesDraft = { role: [], purpose: [], focusAreas: [] }

type ServerProfile = {
  roles: string[]
  purposes: string[]
  focusAreas: string[]
  updatedAt: string
}

// Order-insensitive equality for string arrays — chip selections are
// effectively sets, so toggling order shouldn't make the form "dirty".
function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  for (const value of b) {
    if (!set.has(value)) return false
  }
  return true
}

export function PreferencesCard() {
  const queryClient = useQueryClient()

  // Persisted profile fetched from the server. Returns null when the user
  // hasn't completed onboarding yet (skipped or new account).
  const { data: profileRes } = useQuery<{ data: ServerProfile | null }>({
    queryKey: ['onboarding-profile'],
    queryFn: () => fetch('/api/settings/onboarding-profile').then((r) => r.json()),
    staleTime: CACHE_TIME.stats,
  })
  const persisted: PreferencesDraft = profileRes?.data
    ? { role: profileRes.data.roles, purpose: profileRes.data.purposes, focusAreas: profileRes.data.focusAreas }
    : EMPTY_DRAFT
  const savedAt = profileRes?.data?.updatedAt ?? null

  // Local edit buffer, seeded from the server snapshot the first time we see
  // it and re-seeded whenever the snapshot reference changes (e.g. after a
  // save invalidation). Mirrors the store-as-source-of-truth pattern.
  const [draft, setDraft] = useState<PreferencesDraft>(EMPTY_DRAFT)
  const [seenSnapshot, setSeenSnapshot] = useState<ServerProfile | null | undefined>(undefined)
  const currentSnapshot = profileRes?.data ?? null
  if (profileRes !== undefined && seenSnapshot !== currentSnapshot) {
    setSeenSnapshot(currentSnapshot)
    setDraft(persisted)
  }

  const saveMutation = useMutation({
    mutationFn: (draftToSave: PreferencesDraft) =>
      mutateJson('/api/settings/onboarding-profile', {
        body: {
          role: draftToSave.role,
          purpose: draftToSave.purpose,
          focusAreas: draftToSave.focusAreas,
        },
        fallbackMessage: 'Failed to save preferences',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-profile'] })
      toast.success('Preferences updated')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const dirty =
    !sameStringSet(draft.role, persisted.role) ||
    !sameStringSet(draft.purpose, persisted.purpose) ||
    !sameStringSet(draft.focusAreas, persisted.focusAreas)

  function handleSave() {
    saveMutation.mutate(draft)
  }

  function handleReset() {
    setDraft(persisted)
  }

  const { role, purpose, focusAreas } = draft

  return (
    <Card className="border-white/80 bg-white/95 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-brand-700" />
          Personalisation Preferences
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-2xl border border-gray-200/80 bg-gray-50/70 p-4 text-sm text-gray-600">
          These choices help AI classify emails and generate more relevant tasks. You can change them anytime.
          {savedAt ? (
            <p className="mt-1 text-xs text-gray-400">
              Last updated {formatDistanceToNow(new Date(savedAt), { addSuffix: true })}.
            </p>
          ) : (
            <p className="mt-1 text-xs text-gray-400">Not set yet — pick what fits and click Save.</p>
          )}
        </div>

        <PersonalisationChipGroup
          title="What best describes your current context?"
          hint={`Choose up to ${ONBOARDING_ROLE_LIMIT} if you use EmailFlow across different roles.`}
          options={ONBOARDING_ROLE_OPTIONS}
          selected={role}
          limit={ONBOARDING_ROLE_LIMIT}
          onToggle={(value) =>
            setDraft((cur) => ({ ...cur, role: toggleChipValue(cur.role, value, ONBOARDING_ROLE_LIMIT) }))
          }
        />
        <PersonalisationChipGroup
          title="What will you mainly use EmailFlow for?"
          hint={`Choose up to ${ONBOARDING_PURPOSE_LIMIT}.`}
          options={ONBOARDING_PURPOSE_OPTIONS}
          selected={purpose}
          limit={ONBOARDING_PURPOSE_LIMIT}
          onToggle={(value) =>
            setDraft((cur) => ({ ...cur, purpose: toggleChipValue(cur.purpose, value, ONBOARDING_PURPOSE_LIMIT) }))
          }
        />
        <PersonalisationChipGroup
          title="What should EmailFlow pay attention to?"
          hint={`Choose up to ${ONBOARDING_FOCUS_LIMIT}.`}
          options={ONBOARDING_FOCUS_OPTIONS}
          selected={focusAreas}
          limit={ONBOARDING_FOCUS_LIMIT}
          onToggle={(value) =>
            setDraft((cur) => ({ ...cur, focusAreas: toggleChipValue(cur.focusAreas, value, ONBOARDING_FOCUS_LIMIT) }))
          }
        />

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={!dirty || saveMutation.isPending}>
            Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || saveMutation.isPending}>
            {saveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Saving…
              </>
            ) : (
              'Save preferences'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
