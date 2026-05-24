import { NextRequest } from 'next/server'
import { errorFromException, success, error } from '@/lib/api-helpers'
import { getEmailProvider } from '@/integrations/provider-registry'
import { requireCurrentUser } from '@/lib/auth-sessions'
import { findPasswordHash, findOwnedAccountById } from '@/repositories/user-repo'

export async function POST(req: NextRequest) {
  try {
    const user = await requireCurrentUser()
    const { accountId } = await req.json().catch(() => ({ accountId: undefined }))

    const fullUser = await findPasswordHash(user.id)

    if (!fullUser?.passwordHash) {
      return error('PASSWORD_REQUIRED', 'Please set a password before disconnecting Google', 400)
    }

    if (accountId && typeof accountId !== 'string') {
      return error('VALIDATION_ERROR', 'Invalid accountId', 400)
    }

    const account = accountId
      ? await findOwnedAccountById(user.id, accountId)
      : null

    if (accountId && !account) {
      return error('NOT_FOUND', 'Email account not found', 404)
    }

    await getEmailProvider(account?.provider ?? 'google').disconnect(user.id, accountId)

    return success(undefined)
  } catch (err) {
    console.error('[google disconnect]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Failed to disconnect email account', 500)
  }
}
