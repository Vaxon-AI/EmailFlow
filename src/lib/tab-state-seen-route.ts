import { z } from 'zod'
import { error, errorFromException, getAuthUser, parseJsonBody, success } from '@/lib/api-helpers'

export function createMarkTabSeenRoute<TBucket extends string>(options: {
  buckets: readonly TBucket[]
  invalidMessage: string
  markSeen: (userId: string, bucket: TBucket) => Promise<unknown>
}) {
  const schema = z.object({
    bucket: z.string().min(1, options.invalidMessage),
  })

  return async (req: Request) => {
    try {
      const user = await getAuthUser()
      if (!user) return success({ ok: true })

      const { bucket } = await parseJsonBody(req, schema, {
        code: 'BAD_REQUEST',
        message: options.invalidMessage,
        status: 400,
      })

      if (!options.buckets.includes(bucket as TBucket)) {
        return error('BAD_REQUEST', options.invalidMessage, 400)
      }

      await options.markSeen(user.id, bucket as TBucket)
      return success({ ok: true })
    } catch (err) {
      return errorFromException(err, 'BAD_REQUEST', options.invalidMessage, 400)
    }
  }
}
