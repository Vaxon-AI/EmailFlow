import { describe, expect, it } from 'vitest'
import { filterEmptyActionItems, sanitizeActionItemsJson } from '@/lib/action-items'

describe('filterEmptyActionItems', () => {
  it('drops empty and whitespace-only strings', () => {
    expect(filterEmptyActionItems(['a', '', '  ', 'b'])).toEqual(['a', 'b'])
  })

  it('returns an empty array when all items are empty', () => {
    expect(filterEmptyActionItems(['', '   '])).toEqual([])
  })

  it('keeps a non-empty array unchanged', () => {
    expect(filterEmptyActionItems(['x', 'y'])).toEqual(['x', 'y'])
  })
})

describe('sanitizeActionItemsJson', () => {
  it('drops empty entries from a legacy string array', () => {
    expect(sanitizeActionItemsJson('["a","","  ","b"]')).toBe('["a","b"]')
  })

  it('drops items with empty text from a structured array', () => {
    const input = JSON.stringify([
      { id: 'item-1', text: 'Reply to Siqi', level: 0 },
      { id: 'item-2', text: '', level: 0 },
      { id: 'item-3', text: '   ', level: 1 },
    ])
    expect(sanitizeActionItemsJson(input)).toBe(
      JSON.stringify([{ id: 'item-1', text: 'Reply to Siqi', level: 0 }])
    )
  })

  it('returns an empty array when every item is empty', () => {
    expect(sanitizeActionItemsJson('[""]')).toBe('[]')
  })

  it('does not truncate items longer than the input limit', () => {
    const long = 'x'.repeat(300)
    expect(sanitizeActionItemsJson(JSON.stringify([long]))).toBe(JSON.stringify([long]))
  })

  it('returns invalid JSON unchanged', () => {
    expect(sanitizeActionItemsJson('not-json')).toBe('not-json')
  })

  it('returns non-array JSON unchanged', () => {
    expect(sanitizeActionItemsJson('{"a":1}')).toBe('{"a":1}')
  })
})
