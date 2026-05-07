// Classifies a user's sync recency. Drives the Header sync button:
//   - fresh: skip the modal, run an incremental sync
//   - stale: show a "welcome back" modal so the user picks a window
//   - never: first-time setup
export type SyncState =
  | { kind: 'never' }
  | { kind: 'fresh'; lastSyncAt: string }
  | { kind: 'stale'; lastSyncAt: string; daysSince: number }

const FRESH_DAYS = 7

export function classifySyncState(lastSyncAt: Date | null | undefined, now: Date = new Date()): SyncState {
  if (!lastSyncAt) return { kind: 'never' }
  const days = Math.floor((now.getTime() - lastSyncAt.getTime()) / 86_400_000)
  if (days <= FRESH_DAYS) {
    return { kind: 'fresh', lastSyncAt: lastSyncAt.toISOString() }
  }
  return { kind: 'stale', lastSyncAt: lastSyncAt.toISOString(), daysSince: days }
}

// Anchor preset for the stale-aware modal: pick the closest "round" window.
export function staleAnchorDays(daysSince: number): 7 | 15 | 30 {
  if (daysSince < 15) return 7
  if (daysSince < 30) return 15
  return 30
}
