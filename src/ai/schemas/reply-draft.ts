import { z } from 'zod'

export const replyDraftSchema = z.object({
  reply: z.string().min(1).max(4000),
})

export type ReplyDraftResult = z.infer<typeof replyDraftSchema>
