import DOMPurify from 'isomorphic-dompurify'

const ALLOWED_TAGS = [
  'a', 'b', 'blockquote', 'br', 'code', 'div', 'em',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'small', 'span', 'strong',
  'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
]

const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title', 'width', 'height',
  'colspan', 'rowspan', 'align', 'style',
]

const FORBID_TAGS = ['script', 'iframe', 'object', 'embed', 'form', 'input', 'meta', 'link', 'style']
const FORBID_ATTR = ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur']

export function sanitizeEmailHtml(html: string): string {
  const cleaned = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS,
    FORBID_ATTR,
    ALLOW_DATA_ATTR: false,
  })
  // All links open in a new tab and don't leak referrer.
  return cleaned.replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer nofollow" ')
}
