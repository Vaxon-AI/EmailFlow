import { z } from 'zod'

export const taskDateSuggestionSchema = z.object({
  startDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  reasoning: z.string().max(120).nullable(),
})

export type TaskDateSuggestionResult = z.infer<typeof taskDateSuggestionSchema>
