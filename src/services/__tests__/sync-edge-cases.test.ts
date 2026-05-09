import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Regression / invariant tests for email-sync-service.ts edge cases.
//
// Invariants protected here (not covered in email-sync-service.test.ts):
//   1. Gmail throws → updateLastSync NOT called (critical regression guard)
//   2. Gmail throws → error is re-thrown to caller
//   3. Empty Gmail response → updateLastSync still called
//   4. syncEnabled=false / user not found → updateLastSync NOT called
//   5. Message with null threadId → stored without crash
//   6. Phase1Result field stability — all documented fields always present
//   7. wasCreated=false (duplicate) is counted as skipped, NOT as failure
//   8. recordFailedEmail throwing does not propagate — other emails continue
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/integrations', () => ({
  gmailProvider: { fetchNewEmails: vi.fn() },
}))

vi.mock('@/repositories/email-repo', () => ({
  storeEmail: vi.fn(),
  fixStuckEmails: vi.fn(),
}))

vi.mock('@/repositories/user-repo', () => ({
  getUserSyncInfo: vi.fn(),
  updateLastSync: vi.fn(),
  listEnabledGmailAccounts: vi.fn(),
  updateAccountLastSync: vi.fn(),
}))

vi.mock('@/repositories/failed-email-sync-repo', () => ({
  recordFailedEmail: vi.fn(),
  countPendingFailures: vi.fn(),
  loadPendingFailures: vi.fn(),
  resolveFailedEmail: vi.fn(),
  recordRetryFailure: vi.fn(),
}))

vi.mock('@/workflows', () => ({
  processEmail: vi.fn(),
}))

vi.mock('@/lib/quota', () => ({
  getClassifyRemaining: vi.fn().mockResolvedValue(Infinity),
  incrementClassifyUsed: vi.fn().mockResolvedValue(undefined),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { gmailProvider } from '@/integrations'
import * as emailRepo from '@/repositories/email-repo'
import * as userRepo from '@/repositories/user-repo'
import * as failedRepo from '@/repositories/failed-email-sync-repo'
import { syncEmailsPhase1 } from '../email-sync-service'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DEFAULT_SYNC_INFO = {
  lastSyncAt: null,
  gmailConnected: true,
  syncEnabled: true,
  emailProviderReauthRequired: false,
  emailProviderReauthReason: null,
  emailProviderReauthAt: null,
  emailProviderReauthProvider: null,
}

function makeGmailMessage(id: string, overrides: Record<string, unknown> = {}) {
  return {
    providerMessageId: id,
    threadId: `thread-${id}`,
    subject: `Subject ${id}`,
    sender: 'sender@example.com',
    recipients: [],
    bodyPreview: 'Preview',
    bodyFull: 'Body',
    receivedAt: new Date(),
    labels: [],
    hasAttachments: false,
    providerCategories: [] as const,
    ...overrides,
  }
}

function makeStoredEmail(id: string) {
  return {
    id,
    subject: 'Test',
    sender: 'sender@example.com',
    receivedAt: new Date(),
    bodyPreview: 'Preview',
    bodyFull: 'Body',
    labels: '[]',
    threadId: 'thread-1',
  }
}

// ---------------------------------------------------------------------------
// Default setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(userRepo.getUserSyncInfo).mockResolvedValue(DEFAULT_SYNC_INFO as any)
  vi.mocked(userRepo.updateLastSync).mockResolvedValue({} as any)
  vi.mocked(userRepo.listEnabledGmailAccounts).mockResolvedValue([] as any)
  vi.mocked(userRepo.updateAccountLastSync).mockResolvedValue({} as any)
  vi.mocked(gmailProvider.fetchNewEmails).mockResolvedValue([])
  vi.mocked(emailRepo.storeEmail).mockResolvedValue({ email: makeStoredEmail('e1') as any, wasCreated: true })
  vi.mocked(emailRepo.fixStuckEmails).mockResolvedValue(0)
  vi.mocked(failedRepo.countPendingFailures).mockResolvedValue(0)
  vi.mocked(failedRepo.recordFailedEmail).mockResolvedValue(undefined as any)
  vi.mocked(failedRepo.loadPendingFailures).mockResolvedValue([])
  vi.mocked(failedRepo.resolveFailedEmail).mockResolvedValue(undefined as any)
  vi.mocked(failedRepo.recordRetryFailure).mockResolvedValue(undefined as any)
})

// ---------------------------------------------------------------------------
// Critical regression: Gmail failure must NOT update lastSyncAt
//
// Historical bug: if the Gmail fetch threw and the error was caught in the
// per-email loop (wrong placement), updateLastSync ran anyway.  This would
// report a successful sync timestamp even though no emails were fetched.
// ---------------------------------------------------------------------------

describe('syncEmailsPhase1 — Gmail failure must not update lastSyncAt', () => {
  it('does NOT call updateLastSync when fetchNewEmails throws', async () => {
    vi.mocked(gmailProvider.fetchNewEmails).mockRejectedValue(new Error('Gmail API 500'))

    await syncEmailsPhase1('user-1').catch(() => {})

    expect(userRepo.updateLastSync).not.toHaveBeenCalled()
  })

  it('re-throws the Gmail error so the caller knows the sync failed', async () => {
    vi.mocked(gmailProvider.fetchNewEmails).mockRejectedValue(new Error('Gmail API 500'))

    await expect(syncEmailsPhase1('user-1')).rejects.toThrow('Gmail API 500')
  })

})

// ---------------------------------------------------------------------------
// Guard failures must also not update lastSyncAt
// ---------------------------------------------------------------------------

describe('syncEmailsPhase1 — guard failures must not update lastSyncAt', () => {
  it('does NOT call updateLastSync when syncEnabled is false', async () => {
    vi.mocked(userRepo.getUserSyncInfo).mockResolvedValue({
      ...DEFAULT_SYNC_INFO, syncEnabled: false,
    } as any)

    await syncEmailsPhase1('user-1').catch(() => {})

    expect(userRepo.updateLastSync).not.toHaveBeenCalled()
  })

  it('does NOT call updateLastSync when user is not found', async () => {
    vi.mocked(userRepo.getUserSyncInfo).mockResolvedValue(null)

    await syncEmailsPhase1('user-1').catch(() => {})

    expect(userRepo.updateLastSync).not.toHaveBeenCalled()
  })

  it('does NOT call updateLastSync when Gmail is not connected', async () => {
    vi.mocked(userRepo.getUserSyncInfo).mockResolvedValue({
      ...DEFAULT_SYNC_INFO, gmailConnected: false,
    } as any)

    await syncEmailsPhase1('user-1').catch(() => {})

    expect(userRepo.updateLastSync).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Empty Gmail response — this is a valid sync run; lastSyncAt must update
// ---------------------------------------------------------------------------

describe('syncEmailsPhase1 — empty Gmail response is a valid run', () => {
  it('calls updateLastSync even when Gmail returns no messages', async () => {
    vi.mocked(gmailProvider.fetchNewEmails).mockResolvedValue([])

    await syncEmailsPhase1('user-1')

    expect(userRepo.updateLastSync).toHaveBeenCalledOnce()
    expect(userRepo.updateLastSync).toHaveBeenCalledWith('user-1')
  })

  it('returns zero counts when Gmail returns no messages', async () => {
    vi.mocked(gmailProvider.fetchNewEmails).mockResolvedValue([])

    const result = await syncEmailsPhase1('user-1')

    expect(result.totalFetched).toBe(0)
    expect(result.syncedCount).toBe(0)
    expect(result.skippedCount).toBe(0)
    expect(result.failedCount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Duplicate dedup — wasCreated:false is "skipped", never "failed"
//
// Historical bug: caller misread wasCreated:false as a store error, which
// incremented failedCount and called recordFailedEmail unnecessarily.
// ---------------------------------------------------------------------------

describe('syncEmailsPhase1 — duplicate email counted as skipped, not failed', () => {
  it('increments skippedCount and NOT failedCount for a duplicate', async () => {
    vi.mocked(gmailProvider.fetchNewEmails).mockResolvedValue([makeGmailMessage('msg-dup')])
    vi.mocked(emailRepo.storeEmail).mockResolvedValue({ email: makeStoredEmail('e1') as any, wasCreated: false })

    const result = await syncEmailsPhase1('user-1')

    expect(result.skippedCount).toBe(1)
    expect(result.failedCount).toBe(0)
  })

  it('does NOT call recordFailedEmail for a duplicate (wasCreated:false is success)', async () => {
    vi.mocked(gmailProvider.fetchNewEmails).mockResolvedValue([makeGmailMessage('msg-dup')])
    vi.mocked(emailRepo.storeEmail).mockResolvedValue({ email: makeStoredEmail('e1') as any, wasCreated: false })

    await syncEmailsPhase1('user-1')

    expect(failedRepo.recordFailedEmail).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// recordFailedEmail throwing must not prevent remaining emails from storing
// ---------------------------------------------------------------------------

describe('syncEmailsPhase1 — recordFailedEmail failure is isolated', () => {
  it('continues storing remaining emails when recordFailedEmail throws', async () => {
    vi.mocked(gmailProvider.fetchNewEmails).mockResolvedValue([
      makeGmailMessage('msg-fail'),
      makeGmailMessage('msg-ok'),
    ])
    vi.mocked(emailRepo.storeEmail)
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce({ email: makeStoredEmail('e2') as any, wasCreated: true })
    vi.mocked(failedRepo.recordFailedEmail).mockRejectedValue(new Error('record also failed'))

    const result = await syncEmailsPhase1('user-1')

    expect(result.syncedCount).toBe(1)
    expect(result.failedCount).toBe(1)
  })

  it('calls updateLastSync even when recordFailedEmail throws', async () => {
    vi.mocked(gmailProvider.fetchNewEmails).mockResolvedValue([makeGmailMessage('msg-fail')])
    vi.mocked(emailRepo.storeEmail).mockRejectedValue(new Error('DB error'))
    vi.mocked(failedRepo.recordFailedEmail).mockRejectedValue(new Error('record also failed'))

    await syncEmailsPhase1('user-1')

    expect(userRepo.updateLastSync).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// Message with null threadId — must be stored without crash
// ---------------------------------------------------------------------------

describe('syncEmailsPhase1 — message with null threadId', () => {
  it('stores a message that has no threadId without throwing', async () => {
    vi.mocked(gmailProvider.fetchNewEmails).mockResolvedValue([
      makeGmailMessage('msg-no-thread', { threadId: null }),
    ])

    const result = await syncEmailsPhase1('user-1')

    expect(result.totalFetched).toBe(1)
    expect(emailRepo.storeEmail).toHaveBeenCalledOnce()
    expect(emailRepo.storeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({ providerMessageId: 'msg-no-thread', threadId: null }),
      })
    )
  })
})

// ---------------------------------------------------------------------------
// Phase1Result structural stability
//
// If someone renames a field in Phase1Result, every consumer of the sync
// API breaks silently.  This test pins the field names so CI catches it.
// ---------------------------------------------------------------------------

describe('Phase1Result — field stability', () => {
  it('returns all required fields in the result object', async () => {
    const result = await syncEmailsPhase1('user-1')

    expect(result).toHaveProperty('totalFetched')
    expect(result).toHaveProperty('syncedCount')
    expect(result).toHaveProperty('skippedCount')
    expect(result).toHaveProperty('failedCount')
    expect(result).toHaveProperty('pendingFailedCount')
    expect(result).toHaveProperty('syncBatchId')
    expect(result).toHaveProperty('quotaLimited')
    expect(result).toHaveProperty('quotaRemaining')
    expect(result).toHaveProperty('storedEmails')
  })

  it('storedEmails is always an array (never undefined or null)', async () => {
    const result = await syncEmailsPhase1('user-1')
    expect(Array.isArray(result.storedEmails)).toBe(true)
  })

  it('syncBatchId is a non-empty string', async () => {
    const result = await syncEmailsPhase1('user-1')
    expect(typeof result.syncBatchId).toBe('string')
    expect(result.syncBatchId.length).toBeGreaterThan(0)
  })
})
