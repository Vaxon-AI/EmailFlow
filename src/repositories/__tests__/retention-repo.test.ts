import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProtectionRuleType } from '@prisma/client'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    retentionPolicy: {
      upsert: vi.fn(),
    },
    protectionRule: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    email: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    deletedEmailMarker: {
      createMany: vi.fn(),
    },
    retentionJobLog: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  addProtectionRule,
  deleteEmailRows,
  getEmailsForRetentionCheck,
  getOrCreatePolicy,
  getProtectionRules,
} from '../retention-repo'

const mockRetentionPolicy = vi.mocked(prisma.retentionPolicy)
const mockProtectionRule = vi.mocked(prisma.protectionRule)
const mockEmail = vi.mocked(prisma.email)
const mockDeletedEmailMarker = vi.mocked(prisma.deletedEmailMarker)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getOrCreatePolicy', () => {
  it('maps the persisted policy row to a policy snapshot', async () => {
    mockRetentionPolicy.upsert.mockResolvedValue({
      userId: 'user-1',
      metadataOnlyAfterDays: 30,
      purgeAfterDays: 90,
      taskDoneArchiveAfterDays: 7,
      taskDoneMetadataOnlyAfterDays: 30,
      taskDoneRestoreWindowDays: 14,
      attachmentPurgeAfterDays: 60,
      purgeGracePeriodDays: 90,
      staleReviewDismissAfterDays: 15,
      taskRetainAfterDays: 30,
    } as never)

    const result = await getOrCreatePolicy('user-1')

    expect(result).toEqual({
      metadataOnlyAfterDays: 30,
      purgeAfterDays: 90,
      taskDoneArchiveAfterDays: 7,
      taskDoneMetadataOnlyAfterDays: 30,
      taskDoneRestoreWindowDays: 14,
      attachmentPurgeAfterDays: 60,
      purgeGracePeriodDays: 90,
      staleReviewDismissAfterDays: 15,
      taskRetainAfterDays: 30,
    })
    expect(mockRetentionPolicy.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1' },
      update: {},
    })
  })
})

describe('getProtectionRules and addProtectionRule', () => {
  it('maps rule rows down to the snapshot shape', async () => {
    mockProtectionRule.findMany.mockResolvedValue([
      { ruleType: 'SENDER_DOMAIN', value: 'vip.example.com' },
      { ruleType: 'LABEL', value: 'important' },
    ] as never)

    const result = await getProtectionRules('user-1')

    expect(result).toEqual([
      { ruleType: 'SENDER_DOMAIN', value: 'vip.example.com' },
      { ruleType: 'LABEL', value: 'important' },
    ])
  })

  it('normalizes rule values before creating', async () => {
    mockProtectionRule.create.mockResolvedValue({ id: 'rule-1' } as never)

    await addProtectionRule('user-1', 'SENDER_DOMAIN' as ProtectionRuleType, '  VIP.EXAMPLE.COM  ')

    expect(mockProtectionRule.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', ruleType: 'SENDER_DOMAIN', value: 'vip.example.com' },
    })
  })
})

describe('getEmailsForRetentionCheck', () => {
  it('computes completedTaskAt as the earliest completed linked task date', async () => {
    mockEmail.findMany.mockResolvedValue([
      {
        id: 'email-1',
        retentionStatus: 'ACTIVE',
        receivedAt: new Date('2026-05-01T00:00:00Z'),
        sender: 'alice@example.com',
        labels: '["INBOX"]',
        archivedAt: null,
        metadataOnlyAt: null,
        restorableUntil: null,
        taskLinks: [
          { task: { status: 'active', completedAt: null } },
          { task: { status: 'completed', completedAt: new Date('2026-05-20T00:00:00Z') } },
          { task: { status: 'completed', completedAt: new Date('2026-05-10T00:00:00Z') } },
        ],
      },
    ] as never)

    const result = await getEmailsForRetentionCheck('user-1')

    expect(result).toEqual([
      expect.objectContaining({
        id: 'email-1',
        completedTaskAt: new Date('2026-05-10T00:00:00Z'),
      }),
    ])
    expect(mockEmail.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        retentionStatus: { not: 'PURGED' },
      },
      select: expect.objectContaining({
        id: true,
        taskLinks: {
          select: {
            task: {
              select: { status: true, completedAt: true },
            },
          },
        },
      }),
      orderBy: { receivedAt: 'asc' },
    })
  })
})

describe('deleteEmailRows', () => {
  it('creates tombstones and deletes matching purged rows', async () => {
    mockEmail.findMany.mockResolvedValue([
      { id: 'email-1', accountId: 'account-1', providerMessageId: 'msg-1' },
      { id: 'email-2', accountId: null, providerMessageId: 'msg-2' },
    ] as never)
    mockDeletedEmailMarker.createMany.mockResolvedValue({ count: 2 } as never)
    mockEmail.deleteMany.mockResolvedValue({ count: 2 } as never)

    const result = await deleteEmailRows('user-1', 30)

    expect(result).toBe(2)
    expect(mockDeletedEmailMarker.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 'user-1', accountId: 'account-1', providerMessageId: 'msg-1' },
        { userId: 'user-1', accountId: null, providerMessageId: 'msg-2' },
      ],
      skipDuplicates: true,
    })
    expect(mockEmail.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['email-1', 'email-2'] } },
    })
  })

  it('returns 0 without writes when there are no expired purged rows', async () => {
    mockEmail.findMany.mockResolvedValue([] as never)

    await expect(deleteEmailRows('user-1', 30)).resolves.toBe(0)
    expect(mockDeletedEmailMarker.createMany).not.toHaveBeenCalled()
    expect(mockEmail.deleteMany).not.toHaveBeenCalled()
  })
})
