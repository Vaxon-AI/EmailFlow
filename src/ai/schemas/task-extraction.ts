import { z } from 'zod'

export const taskCandidateSchema = z.object({
  title: z.string().max(80),
  summary: z.string().max(200),
  actionItems: z.array(z.string()),
  explicitDeadline: z.string().nullable(),
  inferredDeadline: z.string().nullable(),
  deadlineConfidence: z.number().min(0).max(1),
  splitReason: z.string().max(160).nullable(),
})

// Schema for task extraction output. A simple email should usually return one
// candidate; only independent outcomes should be split into multiple tasks.
export const taskExtractionSchema = z.object({
  tasks: z.array(taskCandidateSchema).min(1).max(5),
})

export type TaskCandidate = z.infer<typeof taskCandidateSchema>
export type TaskExtractionResult = z.infer<typeof taskExtractionSchema>
