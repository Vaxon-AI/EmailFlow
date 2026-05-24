import { describe, expect, it } from 'vitest'

import {
  CACHE_TIME,
  WORKSPACE_QUERY_ROOTS,
  isWorkspaceQueryKey,
} from '../query-cache'

describe('CACHE_TIME', () => {
  it('keeps the expected cache durations in milliseconds', () => {
    expect(CACHE_TIME.auth).toBe(5 * 60 * 1000)
    expect(CACHE_TIME.stats).toBe(5 * 60 * 1000)
    expect(CACHE_TIME.list).toBe(5 * 60 * 1000)
    expect(CACHE_TIME.detail).toBe(2 * 60 * 1000)
    expect(CACHE_TIME.taxonomy).toBe(10 * 60 * 1000)
  })
})

describe('isWorkspaceQueryKey', () => {
  it('returns true for every declared workspace root', () => {
    for (const root of WORKSPACE_QUERY_ROOTS) {
      expect(isWorkspaceQueryKey([root])).toBe(true)
      expect(isWorkspaceQueryKey([root, 'nested'])).toBe(true)
    }
  })

  it('returns false for empty or non-string query roots', () => {
    expect(isWorkspaceQueryKey([])).toBe(false)
    expect(isWorkspaceQueryKey([null])).toBe(false)
    expect(isWorkspaceQueryKey([42])).toBe(false)
    expect(isWorkspaceQueryKey([{}])).toBe(false)
  })

  it('returns false for unknown string roots', () => {
    expect(isWorkspaceQueryKey(['settings'])).toBe(false)
    expect(isWorkspaceQueryKey(['dashboard'])).toBe(false)
  })
})
