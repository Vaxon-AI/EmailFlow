import { describe, it, expect } from 'vitest'
import { extractBody } from '../client'

function b64(s: string): string {
  return Buffer.from(s, 'utf-8').toString('base64url')
}

describe('extractBody', () => {
  it('returns empty when payload has neither body nor parts', () => {
    expect(extractBody({})).toEqual({ text: '', html: null })
  })

  it('decodes a plain-text-only body (no parts)', () => {
    const payload = { mimeType: 'text/plain', body: { data: b64('Hello\n\nWorld') } }
    expect(extractBody(payload)).toEqual({ text: 'Hello\n\nWorld', html: null })
  })

  it('decodes an HTML-only body (no parts) and derives text', () => {
    const payload = {
      mimeType: 'text/html',
      body: { data: b64('<p>Hello</p><p>World</p>') },
    }
    const result = extractBody(payload)
    expect(result.html).toBe('<p>Hello</p><p>World</p>')
    expect(result.text).toBe('Hello\nWorld')
  })

  it('prefers text/plain part for text but keeps the HTML part for rendering', () => {
    const payload = {
      parts: [
        { mimeType: 'text/plain', body: { data: b64('plain text body') } },
        { mimeType: 'text/html', body: { data: b64('<p>html body</p>') } },
      ],
    }
    expect(extractBody(payload)).toEqual({
      text: 'plain text body',
      html: '<p>html body</p>',
    })
  })

  it('falls back to derived text when only text/html part is present', () => {
    const payload = {
      parts: [
        { mimeType: 'text/html', body: { data: b64('<div>Line 1</div><div>Line 2</div>') } },
      ],
    }
    const result = extractBody(payload)
    expect(result.html).toBe('<div>Line 1</div><div>Line 2</div>')
    expect(result.text).toBe('Line 1\nLine 2')
  })

  it('preserves paragraph breaks and list markers (the bug we fixed)', () => {
    const html =
      '<p>Dear user,</p><p>Your request is complete.</p><ul><li>Item A</li><li>Item B</li></ul>'
    const payload = { parts: [{ mimeType: 'text/html', body: { data: b64(html) } }] }
    const { text } = extractBody(payload)
    expect(text).toContain('Dear user,')
    expect(text).toContain('Your request is complete.')
    expect(text).toContain('• Item A')
    expect(text).toContain('• Item B')
    expect(text).not.toMatch(/Dear user, Your request is complete\./)
  })

  it('strips <style> and <script> contents from the text fallback', () => {
    const html =
      '<style>body{color:red}</style><script>alert(1)</script><p>Visible</p>'
    const payload = { parts: [{ mimeType: 'text/html', body: { data: b64(html) } }] }
    const { text } = extractBody(payload)
    expect(text).toBe('Visible')
  })

  it('recurses into nested multipart parts', () => {
    const payload = {
      mimeType: 'multipart/related',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/plain', body: { data: b64('plain') } },
            { mimeType: 'text/html', body: { data: b64('<p>html</p>') } },
          ],
        },
      ],
    }
    expect(extractBody(payload)).toEqual({ text: 'plain', html: '<p>html</p>' })
  })

  it('decodes common HTML entities in the text fallback', () => {
    const html = '<p>5 &lt; 10 &amp; 20 &gt; 15</p>'
    const payload = { parts: [{ mimeType: 'text/html', body: { data: b64(html) } }] }
    const { text } = extractBody(payload)
    expect(text).toBe('5 < 10 & 20 > 15')
  })
})
