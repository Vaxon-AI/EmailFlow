// ============================================================
// Type re-exports — keeps all existing imports working
// New code should import from specific files:
//   import { PriorityBand } from '@/types/task'
//   import { ApiResponse } from '@/types/common'
// AI output types now live in @/ai/schemas/
// ============================================================

// Email types
export type { EmailCategory, EmailInput, ThreadContext } from './email'

// Task types
export type { TaskStatus, PriorityBand } from './task'
export { getPriorityBand, getPriorityColor, getPriorityLabel, getTaskStatusLabel } from './task'

// Common types
export type { ApiResponse } from './common'

// AI output types (re-exported from schemas for backward compatibility)
export type {
  ClassificationResult,
  TaskExtractionResult,
  PriorityResult,
} from '@/ai/schemas'

// Legacy aliases
export type UrgencyScore = 1 | 2 | 3 | 4 | 5
export type ImpactScore = 1 | 2 | 3 | 4 | 5
