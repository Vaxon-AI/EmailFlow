export const ACTION_ITEM_MAX_LENGTH = 100

export function filterEmptyActionItems(items: string[]): string[] {
  return items.filter((item) => item.trim() !== '')
}

// Drops entries with empty trimmed text from a serialized actionItems value.
// Handles both persisted formats: string[] (legacy) and {id,text,level}[]
// (structured). Returns the input unchanged if it isn't a parsable array.
export function sanitizeActionItemsJson(value: string): string {
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return value

    const filtered = parsed.filter((item) => {
      if (typeof item === 'string') return item.trim() !== ''
      if (item && typeof item === 'object' && 'text' in item) {
        return String(item.text).trim() !== ''
      }
      return true
    })
    return JSON.stringify(filtered)
  } catch {
    return value
  }
}
