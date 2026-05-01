// ============================================================
// AI Module — public API
// Import from '@/ai' to use any AI capability
// ============================================================

// Skills (what the AI can do)
export {
  classifyEmail,
  extractTask,
  scorePriority,
  updateThreadMemory,
  matchMatter,
} from './skills'

export type {
  ClassifyEmailInput,
  ExtractTaskInput,
  ScorePriorityInput,
  UpdateThreadMemoryInput,
  MatchMatterInput,
} from './skills'

// Schemas (output format definitions)
export {
  classificationSchema,
  taskExtractionSchema,
  taskCandidateSchema,
  prioritySchema,
  threadMemoryUpdateSchema,
  matchMatterSchema,
} from './schemas'

export type {
  ClassificationResult,
  TaskCandidate,
  TaskExtractionResult,
  PriorityResult,
  ThreadMemoryUpdateResult,
  MatchMatterResult,
} from './schemas'

// Provider (model configuration)
export { getModel, getFallbackModel, type ModelTier } from './provider'

// Utils (pre-processing)
export {
  preFilterEmail,
  cleanEmailBody,
  prepareForClassification,
  prepareForExtraction,
} from './utils'
export type { PreFilterInput, PreFilterResult } from './utils'
