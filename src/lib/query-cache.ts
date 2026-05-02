export const CACHE_TIME = {
  auth: 5 * 60 * 1000,
  stats: 5 * 60 * 1000,
  list: 5 * 60 * 1000,
  detail: 2 * 60 * 1000,
  taxonomy: 10 * 60 * 1000,
} as const

export const WORKSPACE_QUERY_ROOTS = [
  'stats',
  'dashboard-summary',
  'matters',
  'tasks',
  'task',
  'emails',
  'email',
  'identities',
  'projects',
  'auth-me',
  'auth-user',
] as const

export function isWorkspaceQueryKey(queryKey: readonly unknown[]) {
  const root = queryKey[0]
  return typeof root === 'string' && WORKSPACE_QUERY_ROOTS.includes(root as (typeof WORKSPACE_QUERY_ROOTS)[number])
}
