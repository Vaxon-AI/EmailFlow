export const dynamic = 'force-dynamic'

import { createMarkTabSeenRoute } from '@/lib/tab-state-seen-route'
import { EMAIL_TAB_BUCKETS, markEmailTabSeen, type EmailTabBucket } from '@/repositories/email-repo'

export const POST = createMarkTabSeenRoute<EmailTabBucket>({
  buckets: EMAIL_TAB_BUCKETS,
  invalidMessage: 'Invalid email tab bucket',
  markSeen: markEmailTabSeen,
})
