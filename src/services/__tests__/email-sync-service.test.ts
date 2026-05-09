import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that reference them
// ---------------------------------------------------------------------------

vi.mock('@/integrations', () => ({
  gmailProvider: {
    fetchNewEmails: vi.fn(),
  },
}))

vi.mock('@/repositories/email-repo', () => ({
  storeEmail: vi.fn(),
  fixStuckEmails: vi.fn(),
}))

vi.mock('@/repositories/user-repo', () => ({
  getUserSyncInfo: vi.fn(),
  updateLastSync: vi.fn(),
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
import { processEmail } from '@/workflows'
import { syncEmailsPhase1, syncEmailsPhase2 } from '../email-sync-service'
import { AppError } from '@/lib/app-errors'

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

function makeGmailMessage(id: string) {
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
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(userRepo.getUserSyncInfo).mockResolvedValue(DEFAULT_SYNC_INFO as any)
  vi.mocked(userRepo.updateLastSync).mockResolvedValue({} as any)
  vi.mocked(gmailProvider.fetchNewEmails).mockResolvedValue([])
  vi.mocked(emailRepo.storeEmail).mockResolvedValue({ email: makeStoredEmail('e1') as any, wasCreated: true })
  vi.mocked(emailRepo.fixStuckEmails).mockResolvedValue(0)
  vi.mocked(failedRepo.countPendingFailures).mockResolvedValue(0)
  vi.mocked(failedRepo.recordFailedEmail).mockResolvedValue(undefined as any)
  vi.mocked(failedRepo.loadPendingFailures).mockResolvedValue([])
  vi.mocked(failedRepo.resolveFailedEmail).mockResolvedValue(undefined as any)
  vi.mocked(failedRepo.recordRetryFailure).mockResolvedValue(undefined as any)
  vi.mocked(processEmail).mockResolvedValue({
    emailId: 'e1', classification: 'action', confidence: 0.9,
    taskCreated: false, skippedByRule: false,
  })
})

// ---------------------------------------------------------------------------
// syncEmailsPhase1 tests
// ---------------------------------------------------------------------------

describe('syncEmailsPhase1 — guards', () => {
  it('throws when user is not found', async () => {
    vi.mocked(userRepo.getUserSyncInfo).mockResolvedValue(null)
    await expect(syncEmailsPhase1('user-1')).rejects.toThrow('User not found')
  })

  it('throws when email is not connected', async () => {
    vi.mocked(userRepo.getUserSyncInfo).mockResolvedValue({
      ...DEFAULT_SYNC_INFO, gmailConnected: false,
    } as any)
    await expect(syncEmailsPhase1('user-1')).rejects.toThrow('Email not connected')
  })

  it('throws when sync is disabled', async () => {
    vi.mocked(userRepo.getUserSyncInfo).mockResolvedValue({
      ...DEFAULT_SYNC_INFO, syncEnabled: false,
    } as any)
    await expect(syncEmailsPhase1('user-1')).rejects.toThrow('Email sync is disabled')
  })

  it('throws AppError PROVIDER_REAUTH_REQUIRED when reauth is needed', async () => {
    vi.mocked(userRepo.getUserSyncInfo).mockResolvedValue({
      ...DEFAULT_SYNC_INFO,
      emailProviderReauthRequired: true,
      emailProviderReauthProvider: 'gmail',
      emailProviderReauthReason: 'refresh_failed',
    } as any)

    const err = await syncEmailsPhase1('user-1').catch((e) => e)
    expect(err).toBeInstanceOf(AppError)
    expect(err.code).toBe('PROVIDER_REAUTH_REQUIRED')
    expect(err.status).toBe(401)
  })
})

describe('syncEmailsPhase1 — normal flow', () => {
  it('returns correct counts for 2 new emails', async () => {
    vi.mocked(gmailProvider.fetchNewEmails).mockResolvedValue([
      makeGmailMessage('msg-1'),
      makeGmailMessage('msg-2'),
    ])
    vi.mocked(emailRepo.storeEmail)
      .mockResolvedValueOnce({ email: makeStoredEmail('e1') as any, wasCreated: true })
      .mockResolvedValueOnce({ email: makeStoredEmail('e2') as any, wasCreated: true })

    const result = await syncEmailsPhase1('user-1')

    expect(result.totalFetched).toBe(2)
    expect(result.syncedCount).toBe(2)
    expect(result.skippedCount).toBe(0)
    expect(result.failedCount).toBe(0)
  })

  it('counts duplicates as skipped (wasCreated: false)', async () => {
    vi.mocked(gmailProvider.fetchNewEmails).mockResolvedValue([
      makeGmailMessage('msg-1'),
      makeGmailMessage('msg-2'),
    ])
    vi.mocked(emailRepo.storeEmail)
      .mockResolvedValueOnce({ email: makeStoredEmail('e1') as any, wasCreated: true })
      .mockResolvedValueOnce({ email: makeStoredEmail('e2') as any, wasCreated: false }) // duplicate

    const result = await syncEmailsPhase1('user-1')

    expect(result.syncedCount).toBe(1)
    expect(result.skippedCount).toBe(1)
  })

  it('calls updateLastSync once regardless of email count', async () => {
    vi.mocked(gmailProvider.fetchNewEmails).mockResolvedValue([makeGmailMessage('msg-1')])

    await syncEmailsPhase1('user-1')

    expect(userRepo.updateLastSync).toHaveBeenCalledOnce()
    expect(userRepo.updateLastSync).toHaveBeenCalledWith('user-1')
  })

  it('calls updateLastSync even when no new emails are fetched', async () => {
    vi.mocked(gmailProvider.fetchNewEmails).mockResolvedValue([])

    await syncEmailsPhase1('user-1')

    expect(userRepo.updateLastSync).toHaveBeenCalledOnce()
  })

  it('returns totalFetched = 0 and syncedCount = 0 when no emails', async () => {
    vi.mocked(gmailProvider.fetchNewEmails).mockResolvedValue([])

    const result = await syncEmailsPhase1('user-1')

    expect(result.totalFetched).toBe(0)
    expect(result.syncedCount).toBe(0)
    expect(result.skippedCount).toBe(0)
  })

  it('returns pendingFailedCount from countPendingFailures', async () => {
    vi.mocked(failedRepo.countPendingFailures).mockResolvedValue(5)

    const result = await syncEmailsPhase1('user-1')

    expect(result.pendingFailedCount).toBe(5)
  })

  it('returns storedEmails from storeEmail results', async () => {
    const msg = makeGmailMessage('msg-1')
    vi.mocked(gmailProvider.fetchNewEmails).mockResolvedValue([msg])
    const stored = makeStoredEmail('e1')
    vi.mocked(emailRepo.storeEmail).mockResolvedValue({ email: stored as any, wasCreated: true })

    const result = await syncEmailsPhase1('user-1')

    expect(result.storedEmails).toHaveLength(1)
    expect(result.storedEmails[0].id).toBe('e1')
  })
})

describe('syncEmailsPhase1 — per-email failure isolation', () => {
  it('continues processing remaining emails when one storeEmail throws', async () => {
    vi.mocked(gmailProvider.fetchNewEmails).mockResolvedValue([
      makeGmailMessage('msg-1'),
      makeGmailMessage('msg-2'),
      makeGmailMessage('msg-3'),
    ])
    vi.mocked(emailRepo.storeEmail)
      .mockResolvedValueOnce({ email: makeStoredEmail('e1') as any, wasCreated: true })
      .mockRejectedValueOnce(new Error('DB constraint violation'))      // msg-2 fails
      .mockResolvedValueOnce({ email: makeStoredEmail('e3') as any, wasCreated: true })

    const result = await syncEmailsPhase1('user-1')

    expect(result.syncedCount).toBe(2)
    expect(result.failedCount).toBe(1)
  })

  it('calls updateLastSync even when some emails fail to store', async () => {
    vi.mocked(gmailProvider.fetchNewEmails).mockResolvedValue([makeGmailMessage('msg-1')])
    vi.mocked(emailRepo.storeEmail).mockRejectedValue(new Error('DB error'))

    await syncEmailsPhase1('user-1')

    expect(userRepo.updateLastSync).toHaveBeenCalledOnce()
  })

  it('records each failed email in failedRepo', async () => {
    vi.mocked(gmailProvider.fetchNewEmails).mockResolvedValue([makeGmailMessage('msg-fail')])
    vi.mocked(emailRepo.storeEmail).mockRejectedValue(new Error('write failed'))

    await syncEmailsPhase1('user-1')

    expect(failedRepo.recordFailedEmail).toHaveBeenCalledOnce()
    expect(failedRepo.recordFailedEmail).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ providerMessageId: 'msg-fail' }),
      expect.any(String)
    )
  })
})

// ---------------------------------------------------------------------------
// syncEmailsPhase2 tests
// ---------------------------------------------------------------------------

describe('syncEmailsPhase2 — AI pipeline', () => {
  it('calls processEmail for each stored email', async () => {
    const emails = [makeStoredEmail('e1'), makeStoredEmail('e2')] as any[]

    await syncEmailsPhase2('user-1', emails)

    expect(processEmail).toHaveBeenCalledTimes(2)
    expect(processEmail).toHaveBeenCalledWith('user-1', expect.objectContaining({ id: 'e1' }))
    expect(processEmail).toHaveBeenCalledWith('user-1', expect.objectContaining({ id: 'e2' }))
  })

  it('does not call processEmail when storedEmails is empty', async () => {
    await syncEmailsPhase2('user-1', [])
    expect(processEmail).not.toHaveBeenCalled()
  })

  it('continues processing remaining emails when one processEmail throws', async () => {
    const emails = [makeStoredEmail('e1'), makeStoredEmail('e2'), makeStoredEmail('e3')] as any[]
    vi.mocked(processEmail)
      .mockResolvedValueOnce({ emailId: 'e1', classification: 'action', confidence: 0.9, taskCreated: false, skippedByRule: false })
      .mockRejectedValueOnce(new Error('AI timeout'))   // e2 fails
      .mockResolvedValueOnce({ emailId: 'e3', classification: 'ignore', confidence: 0.9, taskCreated: false, skippedByRule: false })

    // Should not throw
    await expect(syncEmailsPhase2('user-1', emails)).resolves.toBeUndefined()
    expect(processEmail).toHaveBeenCalledTimes(3)
  })
})
