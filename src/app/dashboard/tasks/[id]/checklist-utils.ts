export interface ChecklistItem {
  id: string
  text: string
  level: number
  completed: boolean
}

export function parseActionItems(raw: unknown): ChecklistItem[] {
  if (!raw) return []

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw

    // New format: already structured as ChecklistItem[]
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && 'id' in parsed[0]) {
      return parsed
    }

    // Legacy format: simple string array — convert to ChecklistItem[]
    if (Array.isArray(parsed)) {
      return parsed.map((text, idx) => ({
        id: `item-${idx}`,
        text: String(text),
        level: 0,
        completed: false,
      }))
    }

    return []
  } catch {
    return []
  }
}

export function generateChecklistItemId(): string {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function stripChecklistCompletion(items: ChecklistItem[]) {
  return items.map(({ id, text, level }) => ({ id, text, level }))
}

// Get direct children of an item (next level down)
export function getDirectChildren(items: ChecklistItem[], parentId: string): ChecklistItem[] {
  const parentIndex = items.findIndex(i => i.id === parentId)
  if (parentIndex < 0) return []

  const parent = items[parentIndex]
  const children: ChecklistItem[] = []

  for (let i = parentIndex + 1; i < items.length; i++) {
    if (items[i].level === parent.level + 1) {
      children.push(items[i])
    } else if (items[i].level <= parent.level) {
      break
    }
  }

  return children
}

// Check whether an item has any children
export function hasChildren(items: ChecklistItem[], itemId: string): boolean {
  const itemIndex = items.findIndex(i => i.id === itemId)
  if (itemIndex < 0 || itemIndex >= items.length - 1) return false

  const item = items[itemIndex]
  for (let i = itemIndex + 1; i < items.length; i++) {
    if (items[i].level > item.level) {
      return true
    } else if (items[i].level <= item.level) {
      return false
    }
  }
  return false
}

// Delete an item and all its descendants
export function deleteItemWithChildren(items: ChecklistItem[], itemId: string): ChecklistItem[] {
  const itemIndex = items.findIndex(i => i.id === itemId)
  if (itemIndex < 0) return items

  const item = items[itemIndex]
  const result = [...items]
  let deleteCount = 1

  for (let i = itemIndex + 1; i < items.length; i++) {
    if (items[i].level <= item.level) break
    deleteCount++
  }

  result.splice(itemIndex, deleteCount)
  return result
}

// Recursively check whether all children are completed
export function areAllChildrenCompleted(items: ChecklistItem[], itemId: string): boolean {
  const children = getDirectChildren(items, itemId)
  if (children.length === 0) return true

  return children.every(child => {
    if (!child.completed) return false
    return areAllChildrenCompleted(items, child.id)
  })
}
