import { describe, it, expect } from 'vitest'
import { sanitizeEmailHtml } from '../sanitize-email-html'

describe('sanitizeEmailHtml', () => {
  it('strips <script> tags', () => {
    const out = sanitizeEmailHtml('<script>alert(1)</script><p>safe</p>')
    expect(out).not.toContain('script')
    expect(out).toContain('<p>safe</p>')
  })

  it('strips <iframe> tags', () => {
    const out = sanitizeEmailHtml('<iframe src="https://evil"></iframe><p>safe</p>')
    expect(out).not.toContain('iframe')
  })

  it('strips inline event handlers from allowed tags', () => {
    const out = sanitizeEmailHtml('<img src="x" onerror="alert(1)">')
    expect(out).not.toMatch(/onerror/i)
  })

  it('forces every <a> link to open in a new tab with safe rel', () => {
    const out = sanitizeEmailHtml('<a href="https://example.com">click</a>')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer nofollow"')
  })

  it('keeps paragraphs, lists, and basic formatting', () => {
    const html = '<p>Hello</p><ul><li>a</li><li>b</li></ul><strong>bold</strong>'
    const out = sanitizeEmailHtml(html)
    expect(out).toContain('<p>Hello</p>')
    expect(out).toContain('<li>a</li>')
    expect(out).toContain('<strong>bold</strong>')
  })

  it('preserves inline style attributes but drops <style> blocks', () => {
    const html = '<style>p { color: red }</style><p style="margin:0">x</p>'
    const out = sanitizeEmailHtml(html)
    expect(out).not.toMatch(/<style>/)
    expect(out).toContain('style="margin:0"')
  })

  it('forbids <form> and <input> (phishing vector)', () => {
    const out = sanitizeEmailHtml('<form><input name="x"></form><p>ok</p>')
    expect(out).not.toContain('<form')
    expect(out).not.toContain('<input')
    expect(out).toContain('<p>ok</p>')
  })
})
