import { describe, expect, it } from 'vitest'
import { classifySyncState, staleAnchorDays } from '../sync-state'

describe('classifySyncState', () => {
  const NOW = new Date('2026-05-08T12:00:00Z')

  it('returns "never" when lastSyncAt is null', () => {
    expect(classifySyncState(null, NOW)).toEqual({ kind: 'never' })
  })

  it('returns "never" when lastSyncAt is undefined', () => {
    expect(classifySyncState(undefined, NOW)).toEqual({ kind: 'never' })
  })

  it('returns "fresh" when lastSyncAt is within 7 days', () => {
    const lastSync = new Date('2026-05-05T12:00:00Z') // 3 days ago
    expect(classifySyncState(lastSync, NOW)).toEqual({
      kind: 'fresh',
      lastSyncAt: lastSync.toISOString(),
    })
  })

  it('treats exactly 7 days as fresh (boundary)', () => {
    const lastSync = new Date('2026-05-01T12:00:00Z') // exactly 7 days ago
    expect(classifySyncState(lastSync, NOW).kind).toBe('fresh')
  })

  it('returns "stale" when lastSyncAt is > 7 days', () => {
    const lastSync = new Date('2026-04-28T12:00:00Z') // 10 days ago
    const result = classifySyncState(lastSync, NOW)
    expect(result.kind).toBe('stale')
    if (result.kind === 'stale') {
      expect(result.daysSince).toBe(10)
      expect(result.lastSyncAt).toBe(lastSync.toISOString())
    }
  })

  it('handles 50-day-old lastSyncAt', () => {
    const lastSync = new Date('2026-03-19T12:00:00Z') // 50 days ago
    const result = classifySyncState(lastSync, NOW)
    expect(result.kind).toBe('stale')
    if (result.kind === 'stale') expect(result.daysSince).toBe(50)
  })
})

describe('staleAnchorDays', () => {
  it('returns 7 for D < 15', () => {
    expect(staleAnchorDays(8)).toBe(7)
    expect(staleAnchorDays(14)).toBe(7)
  })

  it('returns 15 for 15 <= D < 30', () => {
    expect(staleAnchorDays(15)).toBe(15)
    expect(staleAnchorDays(29)).toBe(15)
  })

  it('returns 30 for D >= 30', () => {
    expect(staleAnchorDays(30)).toBe(30)
    expect(staleAnchorDays(120)).toBe(30)
  })
})
