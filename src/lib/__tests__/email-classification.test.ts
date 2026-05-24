import { describe, expect, it } from 'vitest'

import {
  EMAIL_CLASS_CONFIG,
  EMAIL_BUCKET_CONFIG,
  EMAIL_DISPLAY_CONFIG,
  EMAIL_DETAIL_TONE,
  EMAIL_DETAIL_HEADER_BG,
  getEmailClassConfig,
  getEmailDisplayState,
} from '../email-classification'

describe('getEmailClassConfig', () => {
  it('returns the matching config for each known classification', () => {
    expect(getEmailClassConfig('action')).toBe(EMAIL_CLASS_CONFIG.action)
    expect(getEmailClassConfig('awareness')).toBe(EMAIL_CLASS_CONFIG.awareness)
    expect(getEmailClassConfig('ignore')).toBe(EMAIL_CLASS_CONFIG.ignore)
    expect(getEmailClassConfig('uncertain')).toBe(EMAIL_CLASS_CONFIG.uncertain)
  })

  it('falls back to uncertain for unknown / missing classifications', () => {
    expect(getEmailClassConfig(undefined)).toBe(EMAIL_CLASS_CONFIG.uncertain)
    expect(getEmailClassConfig(null)).toBe(EMAIL_CLASS_CONFIG.uncertain)
    expect(getEmailClassConfig('')).toBe(EMAIL_CLASS_CONFIG.uncertain)
    expect(getEmailClassConfig('mystery')).toBe(EMAIL_CLASS_CONFIG.uncertain)
  })
})

describe('getEmailDisplayState', () => {
  it('returns "tracked" whenever there is at least one linked task — wins over any classification', () => {
    expect(
      getEmailDisplayState({ classification: 'ignore', taskLinks: [{}] }),
    ).toBe('tracked')
    expect(
      getEmailDisplayState({ classification: 'awareness', taskLinks: [{}, {}] }),
    ).toBe('tracked')
    expect(
      getEmailDisplayState({ classification: null, taskLinks: [{}] }),
    ).toBe('tracked')
  })

  it('returns "tracked" for an actioned "action" email even without explicit task links', () => {
    expect(getEmailDisplayState({ classification: 'action', actioned: true })).toBe('tracked')
  })

  it('returns "needs_action" for an un-actioned "action" classification', () => {
    expect(getEmailDisplayState({ classification: 'action' })).toBe('needs_action')
    expect(getEmailDisplayState({ classification: 'action', actioned: false })).toBe('needs_action')
  })

  it('does NOT promote a non-action email to "tracked" just because actioned is true', () => {
    // The actioned flag only shifts the 'action' classification — awareness/ignore
    // should keep their own display state.
    expect(getEmailDisplayState({ classification: 'awareness', actioned: true })).toBe('fyi')
    expect(getEmailDisplayState({ classification: 'ignore', actioned: true })).toBe('ignored')
  })

  it('maps the remaining classifications to their buckets', () => {
    expect(getEmailDisplayState({ classification: 'ignore' })).toBe('ignored')
    expect(getEmailDisplayState({ classification: 'awareness' })).toBe('fyi')
    expect(getEmailDisplayState({ classification: 'uncertain' })).toBe('uncertain')
  })

  it('returns "unclassified" only when there is no classification, no task links, and no action flag', () => {
    expect(getEmailDisplayState({})).toBe('unclassified')
    expect(getEmailDisplayState({ classification: null })).toBe('unclassified')
    expect(getEmailDisplayState({ classification: '', taskLinks: [] })).toBe('unclassified')
  })

  it('treats empty taskLinks as "no links"', () => {
    expect(getEmailDisplayState({ classification: 'awareness', taskLinks: [] })).toBe('fyi')
    expect(getEmailDisplayState({ classification: 'action', taskLinks: [], actioned: false })).toBe('needs_action')
  })
})

describe('display-config tables stay aligned', () => {
  it('exposes a display config entry for every bucket plus the AI-only states', () => {
    // Every selectable bucket must round-trip into the display config without holes.
    for (const key of Object.keys(EMAIL_BUCKET_CONFIG) as Array<keyof typeof EMAIL_BUCKET_CONFIG>) {
      expect(EMAIL_DISPLAY_CONFIG[key]).toBe(EMAIL_BUCKET_CONFIG[key])
    }
    expect(EMAIL_DISPLAY_CONFIG.uncertain).toBe(EMAIL_CLASS_CONFIG.uncertain)
    expect(EMAIL_DISPLAY_CONFIG.unclassified).toBeDefined()
  })

  it('defines a detail tone and header gradient for every display state', () => {
    for (const state of Object.keys(EMAIL_DISPLAY_CONFIG) as Array<keyof typeof EMAIL_DISPLAY_CONFIG>) {
      expect(EMAIL_DETAIL_TONE[state]).toBeTruthy()
      expect(EMAIL_DETAIL_HEADER_BG[state]).toBeTruthy()
    }
  })
})
