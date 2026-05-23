import { describe, it, expect, vi, beforeEach } from 'vitest'
import { subDays, addDays } from 'date-fns'

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that reference them
// ---------------------------------------------------------------------------

vi.mock('@/repositories/retention-repo', () => ({
  getOrCreatePolicy: vi.fn(),
  getProtectionRules: vi.fn(),
  getEmailsForRetentionCheck: vi.fn(),
  createJobLog: vi.fn(),
  completeJobLog: vi.fn(),
  archiveEmails: vi.fn(),
  setMetadataOnly: vi.fn(),
  purgeEmails: vi.fn(),
  deleteEmailRows: vi.fn(),
  restoreEmailBody: vi.fn(),
  updatePolicy: vi.fn(),
}))

vi.mock('@/repositories/attachment-repo', () => ({
  getUnpurgedAttachmentsByEmailIds: vi.fn(),
  getTotalUnpurgedSize: vi.fn(),
  markAttachmentsPurged: vi.fn(),
}))

vi.mock('@/repositories/email-repo', () => ({
  dismissStaleReviewEmails: vi.fn(),
}))

vi.mock('@/services/task-cleanup-service', () => ({
  cleanupTasksForUser: vi.fn(),
}))

vi.mock('@/repositories/digest-repo', () => ({
  deleteExpiredDigests: vi.fn(),
}))

vi.mock('@/integrations/gmail/client', () => ({
  fetchGmailMessageBody: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    email: {
      findFirst: vi.fn(),
    },
  },
}))

// ---------------------------------------------------------------------------
// Import after mocks are registered
// ---------------------------------------------------------------------------

import * as retentionRepo from '@/repositories/retention-repo'
import * as attachmentRepo from '@/repositories/attachment-repo'
import * as emailRepo from '@/repositories/email-repo'
import { cleanupTasksForUser } from '@/services/task-cleanup-service'
import { fetchGmailMessageBody } from '@/integrations/gmail/client'
import * as digestRepo from '@/repositories/digest-repo'
import { prisma } from '@/lib/prisma'
import {
  previewRetention,
  executeRetention,
  restoreEmail,
} from '../retention-service'
import type { EmailSnapshot, PolicySnapshot } from '@/lib/retention-engine'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const NOW = new Date()

const DEFAULT_POLICY: PolicySnapshot = {
  metadataOnlyAfterDays: 30,
  purgeAfterDays: 90,
  taskDoneArchiveAfterDays: 0,
  taskDoneMetadataOnlyAfterDays: 30,
  taskDoneRestoreWindowDays: 30,
  attachmentPurgeAfterDays: 60,
  purgeGracePeriodDays: 90,
  staleReviewDismissAfterDays: 15,
  taskRetainAfterDays: 30,
}

const NO_RULES = [] as const

function makeEmail(overrides: Partial<EmailSnapshot> = {}): EmailSnapshot {
  return {
    id: 'email-1',
    retentionStatus: 'ACTIVE',
    receivedAt: subDays(NOW, 1),
    sender: 'sender@example.com',
    labels: '["INBOX"]',
    archivedAt: null,
    metadataOnlyAt: null,
    restorableUntil: null,
    completedTaskAt: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Helpers to cast mocked functions
// ---------------------------------------------------------------------------

const mockGetPolicy = retentionRepo.getOrCreatePolicy as ReturnType<typeof vi.fn>
const mockGetRules = retentionRepo.getProtectionRules as ReturnType<typeof vi.fn>
const mockGetEmails = retentionRepo.getEmailsForRetentionCheck as ReturnType<typeof vi.fn>
const mockCreateLog = retentionRepo.createJobLog as ReturnType<typeof vi.fn>
const mockCompleteLog = retentionRepo.completeJobLog as ReturnType<typeof vi.fn>
const mockArchive = retentionRepo.archiveEmails as ReturnType<typeof vi.fn>
const mockMetaOnly = retentionRepo.setMetadataOnly as ReturnType<typeof vi.fn>
const mockPurge = retentionRepo.purgeEmails as ReturnType<typeof vi.fn>
const mockDeleteRows = retentionRepo.deleteEmailRows as ReturnType<typeof vi.fn>
const mockRestoreBody = retentionRepo.restoreEmailBody as ReturnType<typeof vi.fn>

const mockGetAttachments = attachmentRepo.getUnpurgedAttachmentsByEmailIds as ReturnType<typeof vi.fn>
const mockGetSize = attachmentRepo.getTotalUnpurgedSize as ReturnType<typeof vi.fn>
const mockPurgeAttachments = attachmentRepo.markAttachmentsPurged as ReturnType<typeof vi.fn>

const mockDismissStale = emailRepo.dismissStaleReviewEmails as ReturnType<typeof vi.fn>
const mockCleanupTasks = cleanupTasksForUser as ReturnType<typeof vi.fn>
const mockDeleteDigests = digestRepo.deleteExpiredDigests as ReturnType<typeof vi.fn>

const mockFetchGmail = fetchGmailMessageBody as ReturnType<typeof vi.fn>
const mockEmailFindFirst = (prisma.email.findFirst as ReturnType<typeof vi.fn>)

function setupDefaultMocks() {
  mockGetPolicy.mockResolvedValue(DEFAULT_POLICY)
  mockGetRules.mockResolvedValue(NO_RULES)
  mockGetEmails.mockResolvedValue([])
  mockCreateLog.mockResolvedValue({ id: 'log-1' })
  mockCompleteLog.mockResolvedValue({})
  mockArchive.mockResolvedValue(undefined)
  // Default: every email passed to setMetadataOnly succeeds.
  mockMetaOnly.mockImplementation(async (emails: Array<unknown>) => ({
    succeeded: emails.length,
    failed: [],
  }))
  mockPurge.mockResolvedValue(undefined)
  mockDeleteRows.mockResolvedValue(0)
  mockRestoreBody.mockResolvedValue({})
  mockGetAttachments.mockResolvedValue([])
  mockGetSize.mockResolvedValue(0)
  mockPurgeAttachments.mockResolvedValue(undefined)
  mockDismissStale.mockResolvedValue(0)
  mockCleanupTasks.mockResolvedValue({ hardDeleted: 0, softArchived: 0, purgedFromArchive: 0 })
  mockDeleteDigests.mockResolvedValue({ dailyDeleted: 0, weeklyDeleted: 0 })
}

beforeEach(() => {
  vi.clearAllMocks()
  setupDefaultMocks()
})

// ---------------------------------------------------------------------------
// previewRetention
// ---------------------------------------------------------------------------

describe('previewRetention', () => {
  it('returns all-zero counts when inbox is empty', async () => {
    mockGetEmails.mockResolvedValue([])
    const preview = await previewRetention('user-1')
    expect(preview.willArchive).toBe(0)
    expect(preview.willBeMetadataOnly).toBe(0)
    expect(preview.willPurge).toBe(0)
    expect(preview.protected).toBe(0)
  })

  it('counts emails that should be archived (task-done, threshold=0)', async () => {
    const emails = [
      makeEmail({ id: 'e1', completedTaskAt: subDays(NOW, 5) }),
      makeEmail({ id: 'e2', completedTaskAt: subDays(NOW, 2) }),
    ]
    mockGetEmails.mockResolvedValue(emails)
    const preview = await previewRetention('user-1')
    expect(preview.willArchive).toBe(2)
    expect(preview.willBeMetadataOnly).toBe(0)
    expect(preview.willPurge).toBe(0)
  })

  it('counts emails that should become metadata-only (general, 31 days old)', async () => {
    const emails = [
      makeEmail({ id: 'e1', receivedAt: subDays(NOW, 31) }),
      makeEmail({ id: 'e2', receivedAt: subDays(NOW, 60) }),
    ]
    mockGetEmails.mockResolvedValue(emails)
    const preview = await previewRetention('user-1')
    expect(preview.willBeMetadataOnly).toBe(2)
    expect(preview.willPurge).toBe(0)
  })

  it('counts emails that should be purged (general, 90+ days old)', async () => {
    const emails = [makeEmail({ id: 'e1', receivedAt: subDays(NOW, 95) })]
    mockGetEmails.mockResolvedValue(emails)
    const preview = await previewRetention('user-1')
    expect(preview.willPurge).toBe(1)
    expect(preview.willBeMetadataOnly).toBe(0)
  })

  it('does not count protected (STARRED) emails', async () => {
    const emails = [
      makeEmail({ id: 'e1', receivedAt: subDays(NOW, 60), labels: '["STARRED"]' }),
    ]
    mockGetEmails.mockResolvedValue(emails)
    const preview = await previewRetention('user-1')
    expect(preview.willBeMetadataOnly).toBe(0)
    expect(preview.protected).toBe(1)
  })

  it('mixes actions correctly across different email states', async () => {
    const emails = [
      makeEmail({ id: 'archive', completedTaskAt: subDays(NOW, 1) }),           // → archive
      makeEmail({ id: 'metaonly', receivedAt: subDays(NOW, 45) }),               // → metadataOnly
      makeEmail({ id: 'purge', receivedAt: subDays(NOW, 100) }),                 // → purge
      makeEmail({ id: 'protected', receivedAt: subDays(NOW, 50), labels: '["IMPORTANT"]' }), // → none
      makeEmail({ id: 'young', receivedAt: subDays(NOW, 5) }),                   // → none (ACTIVE)
    ]
    mockGetEmails.mockResolvedValue(emails)
    const preview = await previewRetention('user-1')
    expect(preview.willArchive).toBe(1)
    expect(preview.willBeMetadataOnly).toBe(1)
    expect(preview.willPurge).toBe(1)
    // 'protected' counts all ACTIVE emails whose action is 'none':
    // the IMPORTANT email (whitelisted) + the young email (within window) = 2
    expect(preview.protected).toBe(2)
  })

  it('estimates attachment bytes freed', async () => {
    const emails = [makeEmail({ id: 'e1', receivedAt: subDays(NOW, 70) })]
    mockGetEmails.mockResolvedValue(emails)
    mockGetAttachments.mockResolvedValue([{ id: 'a1', emailId: 'e1', filename: 'file.pdf', size: 1024 * 100 }])
    mockGetSize.mockResolvedValue(1024 * 100)

    const preview = await previewRetention('user-1')
    expect(preview.attachmentsAffected).toBe(1)
    expect(preview.estimatedBytesFreed).toBe(1024 * 100)
  })
})

// ---------------------------------------------------------------------------
// executeRetention
// ---------------------------------------------------------------------------

describe('executeRetention', () => {
  it('creates a job log and marks it complete', async () => {
    await executeRetention('user-1', 'cron')
    expect(mockCreateLog).toHaveBeenCalledWith('user-1', 'cron')
    expect(mockCompleteLog).toHaveBeenCalledWith('log-1', expect.objectContaining({
      emailsArchived: 0,
      emailsMetaOnly: 0,
      emailsPurged: 0,
    }))
  })

  it('archives task-done emails', async () => {
    const emails = [makeEmail({ id: 'e1', completedTaskAt: subDays(NOW, 3) })]
    mockGetEmails.mockResolvedValue(emails)
    const result = await executeRetention('user-1', 'cron')
    expect(mockArchive).toHaveBeenCalledWith(['e1'], expect.any(String))
    expect(result.emailsArchived).toBe(1)
  })

  it('sets metadata-only for emails past the threshold', async () => {
    const emails = [makeEmail({ id: 'e1', receivedAt: subDays(NOW, 45) })]
    mockGetEmails.mockResolvedValue(emails)
    const result = await executeRetention('user-1', 'cron')
    expect(mockMetaOnly).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'e1' })],
      expect.any(String)
    )
    expect(result.emailsMetaOnly).toBe(1)
  })

  it('purges emails past the purge threshold', async () => {
    const emails = [makeEmail({ id: 'e1', receivedAt: subDays(NOW, 95) })]
    mockGetEmails.mockResolvedValue(emails)
    const result = await executeRetention('user-1', 'cron')
    expect(mockPurge).toHaveBeenCalledWith(['e1'], expect.any(String))
    expect(result.emailsPurged).toBe(1)
  })

  it('does not call archive/metaOnly/purge when inbox is clean', async () => {
    mockGetEmails.mockResolvedValue([])
    await executeRetention('user-1', 'cron')
    expect(mockArchive).not.toHaveBeenCalled()
    expect(mockMetaOnly).not.toHaveBeenCalled()
    expect(mockPurge).not.toHaveBeenCalled()
  })

  it('does not process protected emails', async () => {
    const emails = [
      makeEmail({ id: 'e1', receivedAt: subDays(NOW, 60), labels: '["STARRED"]' }),
    ]
    mockGetEmails.mockResolvedValue(emails)
    const result = await executeRetention('user-1', 'cron')
    expect(mockArchive).not.toHaveBeenCalled()
    expect(mockMetaOnly).not.toHaveBeenCalled()
    expect(result.emailsMetaOnly).toBe(0)
  })

  it('purges attachment records for emails past attachmentPurgeAfterDays', async () => {
    // Email is 65 days old → past attachmentPurgeAfterDays (60)
    const emails = [makeEmail({ id: 'e1', receivedAt: subDays(NOW, 65) })]
    mockGetEmails.mockResolvedValue(emails)
    mockGetAttachments.mockResolvedValue([{ id: 'att-1', emailId: 'e1', filename: 'doc.pdf', size: 500 }])
    const result = await executeRetention('user-1', 'cron')
    expect(mockPurgeAttachments).toHaveBeenCalledWith(['att-1'])
    expect(result.attachmentsPurged).toBe(1)
  })

  it('counts attachment bytes freed', async () => {
    const emails = [makeEmail({ id: 'e1', receivedAt: subDays(NOW, 65) })]
    mockGetEmails.mockResolvedValue(emails)
    mockGetAttachments.mockResolvedValue([
      { id: 'att-1', emailId: 'e1', filename: 'a.pdf', size: 2000 },
      { id: 'att-2', emailId: 'e1', filename: 'b.pdf', size: 3000 },
    ])
    const result = await executeRetention('user-1', 'cron')
    expect(result.bytesFreed).toBe(BigInt(5000))
  })

  it('continues and counts errors when a batch fails', async () => {
    const emails = [
      makeEmail({ id: 'e1', receivedAt: subDays(NOW, 95) }),  // → purge
    ]
    mockGetEmails.mockResolvedValue(emails)
    mockPurge.mockRejectedValueOnce(new Error('DB timeout'))

    const result = await executeRetention('user-1', 'cron')
    expect(result.errorCount).toBe(1)
    expect(result.emailsPurged).toBe(0)
    // Job log should still be completed
    expect(mockCompleteLog).toHaveBeenCalledWith('log-1', expect.objectContaining({
      errorCount: 1,
    }))
  })

  it('setMetadataOnly partial failure: counts succeeded and failed per-email, not per-batch', async () => {
    const emails = [
      makeEmail({ id: 'e1', receivedAt: subDays(NOW, 50) }),
      makeEmail({ id: 'e2', receivedAt: subDays(NOW, 50) }),
      makeEmail({ id: 'e3', receivedAt: subDays(NOW, 50) }),
    ]
    mockGetEmails.mockResolvedValue(emails)
    mockMetaOnly.mockResolvedValueOnce({
      succeeded: 2,
      failed: [{ id: 'e2', error: 'fk constraint' }],
    })

    const result = await executeRetention('user-1', 'cron')
    expect(result.emailsMetaOnly).toBe(2)
    expect(result.errorCount).toBe(1)
  })

  it('runs deleteEmailRows + dismissStaleReviewEmails + cleanupTasksForUser per cron pass', async () => {
    mockDeleteRows.mockResolvedValueOnce(3)
    mockDismissStale.mockResolvedValueOnce(2)
    mockCleanupTasks.mockResolvedValueOnce({ hardDeleted: 4, softArchived: 5, purgedFromArchive: 1 })

    const result = await executeRetention('user-1', 'cron')

    expect(mockDeleteRows).toHaveBeenCalledWith('user-1', 90)
    expect(mockDismissStale).toHaveBeenCalledWith('user-1', 15)
    expect(mockCleanupTasks).toHaveBeenCalledWith('user-1', 30)

    expect(result.emailsDeleted).toBe(3)
    expect(result.staleReviewsDismissed).toBe(2)
    expect(result.tasksHardDeleted).toBe(4)
    expect(result.tasksSoftArchived).toBe(5)
    expect(result.tasksPurgedFromArchive).toBe(1)
  })

  it('counts new pipeline failures into errorCount but still completes', async () => {
    mockDeleteRows.mockRejectedValueOnce(new Error('oops'))
    mockDismissStale.mockRejectedValueOnce(new Error('oops'))
    mockCleanupTasks.mockRejectedValueOnce(new Error('oops'))

    const result = await executeRetention('user-1', 'cron')
    expect(result.errorCount).toBe(3)
    expect(mockCompleteLog).toHaveBeenCalled()
  })

  it('returns the job log id in the result', async () => {
    const result = await executeRetention('user-1', 'manual')
    expect(result.jobLogId).toBe('log-1')
  })

  it('processes mixed email states in a single run', async () => {
    const emails = [
      makeEmail({ id: 'arch',  completedTaskAt: subDays(NOW, 1) }),
      makeEmail({ id: 'meta',  receivedAt: subDays(NOW, 50) }),
      makeEmail({ id: 'purge', receivedAt: subDays(NOW, 95) }),
    ]
    mockGetEmails.mockResolvedValue(emails)
    const result = await executeRetention('user-1', 'cron')
    expect(result.emailsArchived).toBe(1)
    expect(result.emailsMetaOnly).toBe(1)
    expect(result.emailsPurged).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// restoreEmail
// ---------------------------------------------------------------------------

describe('restoreEmail', () => {
  it('returns error when email is not found', async () => {
    mockEmailFindFirst.mockResolvedValue(null)
    const result = await restoreEmail('user-1', 'email-99')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.reason).toContain('not found')
  })

  it('returns error when email is ACTIVE (not METADATA_ONLY)', async () => {
    mockEmailFindFirst.mockResolvedValue({
      id: 'email-1',
      providerMessageId: 'provider-1',
      retentionStatus: 'ACTIVE',
      restorableUntil: null,
    })
    const result = await restoreEmail('user-1', 'email-1')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.reason).toContain('ACTIVE')
  })

  it('returns error when email is PURGED', async () => {
    mockEmailFindFirst.mockResolvedValue({
      id: 'email-1',
      providerMessageId: 'provider-1',
      retentionStatus: 'PURGED',
      restorableUntil: null,
    })
    const result = await restoreEmail('user-1', 'email-1')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.reason).toContain('PURGED')
  })

  it('returns error when restore window has expired', async () => {
    mockEmailFindFirst.mockResolvedValue({
      id: 'email-1',
      providerMessageId: 'provider-1',
      retentionStatus: 'METADATA_ONLY',
      restorableUntil: subDays(NOW, 1),  // expired yesterday
    })
    const result = await restoreEmail('user-1', 'email-1')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.reason).toContain('expired')
  })

  it('returns error when Gmail returns empty body', async () => {
    mockEmailFindFirst.mockResolvedValue({
      id: 'email-1',
      providerMessageId: 'provider-1',
      retentionStatus: 'METADATA_ONLY',
      restorableUntil: addDays(NOW, 10),
    })
    mockFetchGmail.mockResolvedValue('')
    const result = await restoreEmail('user-1', 'email-1')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.reason).toContain('empty body')
  })

  it('returns error when the provider API throws', async () => {
    mockEmailFindFirst.mockResolvedValue({
      id: 'email-1',
      providerMessageId: 'provider-1',
      retentionStatus: 'METADATA_ONLY',
      restorableUntil: addDays(NOW, 10),
    })
    mockFetchGmail.mockRejectedValue(new Error('PROVIDER_REAUTH_REQUIRED'))
    const result = await restoreEmail('user-1', 'email-1')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.reason).toContain('provider')
  })

  it('succeeds when email is METADATA_ONLY and window is open', async () => {
    mockEmailFindFirst.mockResolvedValue({
      id: 'email-1',
      providerMessageId: 'provider-1',
      retentionStatus: 'METADATA_ONLY',
      restorableUntil: addDays(NOW, 15),
    })
    mockFetchGmail.mockResolvedValue('Full email body content here.')
    const result = await restoreEmail('user-1', 'email-1')
    expect(result.success).toBe(true)
    if (result.success) expect(result.emailId).toBe('email-1')
  })

  it('calls restoreEmailBody with the fetched content', async () => {
    mockEmailFindFirst.mockResolvedValue({
      id: 'email-1',
      providerMessageId: 'provider-xyz',
      retentionStatus: 'METADATA_ONLY',
      restorableUntil: addDays(NOW, 20),
    })
    mockFetchGmail.mockResolvedValue('The restored body.')
    await restoreEmail('user-1', 'email-1')
    expect(mockFetchGmail).toHaveBeenCalledWith('user-1', 'provider-xyz')
    expect(mockRestoreBody).toHaveBeenCalledWith('email-1', 'The restored body.')
  })

  it('succeeds when restorableUntil is null (no window set)', async () => {
    // null restorableUntil means we don't enforce a window — allow restore
    mockEmailFindFirst.mockResolvedValue({
      id: 'email-1',
      providerMessageId: 'provider-1',
      retentionStatus: 'METADATA_ONLY',
      restorableUntil: null,
    })
    mockFetchGmail.mockResolvedValue('Body content.')
    const result = await restoreEmail('user-1', 'email-1')
    expect(result.success).toBe(true)
  })
})
