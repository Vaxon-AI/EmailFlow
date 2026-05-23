import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    quotaLedger: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { prisma } from '@/lib/prisma'
import {
  snapshotForUser,
  getInheritedQuotaForEmail,
  mergeGmailLedgerIntoUser,
} from '../quota-ledger-repo'

const mockUser = vi.mocked(prisma.user)
const mockLedger = vi.mocked(prisma.quotaLedger)

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// snapshotForUser
// ---------------------------------------------------------------------------

describe('snapshotForUser', () => {
  it('creates ledger entries for registration email and each bound Gmail account', async () => {
    mockUser.findUnique.mockResolvedValue({
      email: 'Alice@example.com',
      classifyUsed: 42,
      extractUsed: 5,
      pasteTextUsed: 1,
      quotaResetAt: new Date('2026-05-01'),
      accounts: [
        { email: 'alice.work@gmail.com' },
        { email: 'alice.personal@gmail.com' },
      ],
    } as never)
    mockLedger.findUnique.mockResolvedValue(null)

    await snapshotForUser('user-1')

    expect(mockLedger.create).toHaveBeenCalledTimes(3)
    const created = mockLedger.create.mock.calls.map((c) => c[0].data)
    expect(created).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ identifierType: 'email', identifier: 'alice@example.com', classifyUsed: 42 }),
        expect.objectContaining({ identifierType: 'gmail', identifier: 'alice.work@gmail.com', classifyUsed: 42 }),
        expect.objectContaining({ identifierType: 'gmail', identifier: 'alice.personal@gmail.com', classifyUsed: 42 }),
      ]),
    )
  })

  it('merges with existing ledger using max(used) and earlier(quotaResetAt)', async () => {
    mockUser.findUnique.mockResolvedValue({
      email: 'bob@example.com',
      classifyUsed: 30,
      extractUsed: 8,
      pasteTextUsed: 2,
      quotaResetAt: new Date('2026-05-20'), // later
      accounts: [],
    } as never)
    mockLedger.findUnique.mockResolvedValue({
      id: 'ledger-1',
      identifierType: 'email',
      identifier: 'bob@example.com',
      classifyUsed: 80, // higher — should win
      extractUsed: 3, // lower — current wins
      pasteTextUsed: 1, // lower — current wins
      quotaResetAt: new Date('2026-05-10'), // earlier — should win
      firstSeenAt: new Date(),
      lastSnapshotAt: new Date(),
    } as never)

    await snapshotForUser('user-2')

    expect(mockLedger.update).toHaveBeenCalledTimes(1)
    const updateData = mockLedger.update.mock.calls[0][0].data as {
      classifyUsed: number
      extractUsed: number
      pasteTextUsed: number
      quotaResetAt: Date
    }
    expect(updateData.classifyUsed).toBe(80)
    expect(updateData.extractUsed).toBe(8)
    expect(updateData.pasteTextUsed).toBe(2)
    expect(updateData.quotaResetAt).toEqual(new Date('2026-05-10'))
  })

  it('skips silently when the user does not exist', async () => {
    mockUser.findUnique.mockResolvedValue(null)
    await snapshotForUser('missing')
    expect(mockLedger.create).not.toHaveBeenCalled()
    expect(mockLedger.update).not.toHaveBeenCalled()
  })

  it('lowercases and trims identifiers before writing', async () => {
    mockUser.findUnique.mockResolvedValue({
      email: '  MIXED@Case.COM  ',
      classifyUsed: 1,
      extractUsed: 0,
      pasteTextUsed: 0,
      quotaResetAt: new Date(),
      accounts: [],
    } as never)
    mockLedger.findUnique.mockResolvedValue(null)

    await snapshotForUser('user-3')

    expect(mockLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ identifier: 'mixed@case.com' }),
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// getInheritedQuotaForEmail
// ---------------------------------------------------------------------------

describe('getInheritedQuotaForEmail', () => {
  it('returns zero quota when no ledger record exists', async () => {
    mockLedger.findUnique.mockResolvedValue(null)
    const result = await getInheritedQuotaForEmail('new@example.com', 'email')
    expect(result.classifyUsed).toBe(0)
    expect(result.extractUsed).toBe(0)
    expect(result.pasteTextUsed).toBe(0)
    expect(result.quotaResetAt).toBeInstanceOf(Date)
  })

  it('returns the ledger values when only the requested type exists', async () => {
    mockLedger.findUnique
      .mockResolvedValueOnce({
        classifyUsed: 50,
        extractUsed: 4,
        pasteTextUsed: 2,
        quotaResetAt: new Date('2026-05-01'),
      } as never)
      .mockResolvedValueOnce(null)

    const result = await getInheritedQuotaForEmail('user@example.com', 'email')
    expect(result.classifyUsed).toBe(50)
    expect(result.extractUsed).toBe(4)
    expect(result.pasteTextUsed).toBe(2)
    expect(result.quotaResetAt).toEqual(new Date('2026-05-01'))
  })

  it('merges across email and gmail types using max(used) and earlier(quotaResetAt)', async () => {
    mockLedger.findUnique
      .mockResolvedValueOnce({
        classifyUsed: 30,
        extractUsed: 6,
        pasteTextUsed: 0,
        quotaResetAt: new Date('2026-05-15'),
      } as never)
      .mockResolvedValueOnce({
        classifyUsed: 70,
        extractUsed: 2,
        pasteTextUsed: 3,
        quotaResetAt: new Date('2026-05-05'),
      } as never)

    const result = await getInheritedQuotaForEmail('user@example.com', 'email')
    expect(result.classifyUsed).toBe(70)
    expect(result.extractUsed).toBe(6)
    expect(result.pasteTextUsed).toBe(3)
    expect(result.quotaResetAt).toEqual(new Date('2026-05-05'))
  })
})

// ---------------------------------------------------------------------------
// mergeGmailLedgerIntoUser
// ---------------------------------------------------------------------------

describe('mergeGmailLedgerIntoUser', () => {
  it('no-ops when no gmail ledger exists', async () => {
    mockLedger.findUnique.mockResolvedValue(null)
    await mergeGmailLedgerIntoUser('user-1', 'noledger@gmail.com')
    expect(mockUser.update).not.toHaveBeenCalled()
  })

  it('no-ops when ledger has lower or equal values to current user', async () => {
    mockLedger.findUnique.mockResolvedValue({
      classifyUsed: 10,
      extractUsed: 1,
      pasteTextUsed: 0,
      quotaResetAt: new Date('2026-05-20'),
    } as never)
    mockUser.findUnique.mockResolvedValue({
      classifyUsed: 20,
      extractUsed: 2,
      pasteTextUsed: 0,
      quotaResetAt: new Date('2026-05-15'), // earlier than ledger — user already stricter
    } as never)

    await mergeGmailLedgerIntoUser('user-1', 'low@gmail.com')
    expect(mockUser.update).not.toHaveBeenCalled()
  })

  it('updates user with max(used) and earlier(quotaResetAt) when ledger is stricter', async () => {
    mockLedger.findUnique.mockResolvedValue({
      classifyUsed: 90,
      extractUsed: 9,
      pasteTextUsed: 2,
      quotaResetAt: new Date('2026-05-01'), // earlier
    } as never)
    mockUser.findUnique.mockResolvedValue({
      classifyUsed: 10,
      extractUsed: 1,
      pasteTextUsed: 0,
      quotaResetAt: new Date('2026-05-20'),
    } as never)

    await mergeGmailLedgerIntoUser('user-1', 'high@gmail.com')

    const data = mockUser.update.mock.calls[0][0].data as {
      classifyUsed: number
      extractUsed: number
      pasteTextUsed: number
      quotaResetAt: Date
    }
    expect(data.classifyUsed).toBe(90)
    expect(data.extractUsed).toBe(9)
    expect(data.pasteTextUsed).toBe(2)
    expect(data.quotaResetAt).toEqual(new Date('2026-05-01'))
  })
})
