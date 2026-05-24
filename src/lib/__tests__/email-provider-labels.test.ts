import { describe, expect, it } from 'vitest'

import {
  getEmailProviderAccountLabel,
  getEmailProviderLabel,
} from '../email-provider-labels'

describe('getEmailProviderLabel', () => {
  it('maps google/gmail to "Google"', () => {
    expect(getEmailProviderLabel('google')).toBe('Google')
    expect(getEmailProviderLabel('gmail')).toBe('Google')
  })

  it('maps microsoft/outlook to "Outlook"', () => {
    expect(getEmailProviderLabel('microsoft')).toBe('Outlook')
    expect(getEmailProviderLabel('outlook')).toBe('Outlook')
  })

  it('falls back to "Email" for unknown / missing providers', () => {
    expect(getEmailProviderLabel(undefined)).toBe('Email')
    expect(getEmailProviderLabel(null)).toBe('Email')
    expect(getEmailProviderLabel('')).toBe('Email')
    expect(getEmailProviderLabel('yahoo')).toBe('Email')
  })
})

describe('getEmailProviderAccountLabel', () => {
  it('appends " account" to the provider label', () => {
    expect(getEmailProviderAccountLabel('google')).toBe('Google account')
    expect(getEmailProviderAccountLabel('outlook')).toBe('Outlook account')
  })

  it('falls back to "Email account" for unknown providers', () => {
    expect(getEmailProviderAccountLabel(undefined)).toBe('Email account')
    expect(getEmailProviderAccountLabel('yahoo')).toBe('Email account')
  })
})
