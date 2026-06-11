import { z } from 'zod'

// Schema for email classification output
// Vercel AI SDK validates this automatically — if the LLM returns wrong format, it retries
export const classificationSchema = z.object({
  category: z.enum(['action', 'awareness', 'ignore', 'uncertain']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  isWorkRelated: z.boolean(),
  isOngoingMatter: z
    .boolean()
    .describe(
      'true if this email is part of a multi-step, multi-email situation (project, negotiation, application process); false for one-off requests that are done after a single reply or action'
    ),
})

export type ClassificationResult = z.infer<typeof classificationSchema>
