export const dynamic = 'force-dynamic'

import { createMarkTabSeenRoute } from '@/lib/tab-state-seen-route'
import { markTaskTabSeen, TASK_TAB_BUCKETS, type TaskTabBucket } from '@/repositories/task-repo'

export const POST = createMarkTabSeenRoute<TaskTabBucket>({
  buckets: TASK_TAB_BUCKETS,
  invalidMessage: 'Invalid task tab bucket',
  markSeen: markTaskTabSeen,
})
