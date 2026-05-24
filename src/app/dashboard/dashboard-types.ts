export type DashboardTask = {
  id: string
  title: string
  summary: string
  status: string
  priorityScore?: number | null
  explicitDeadline?: string | null
  inferredDeadline?: string | null
  userSetDeadline?: string | null
}

export type DashboardEmail = {
  id: string
  subject: string
  sender?: string | null
  classification?: string | null
}

export type DashboardContextCount = {
  id: string
  name: string
}

export type DashboardProject = {
  id: string
  name: string
  identityId: string | null
  identity: { id: string; name: string } | null
}

export type DashboardStats = {
  emails: {
    total: number
    action: number
    awareness: number
    ignore: number
    uncertain: number
    linkedAction: number
    needsReview: number
    tracked: number
    unclassified?: number
  }
  tasks: { total: number; pending: number; active: number; completed: number }
  sync: {
    lastSyncAt?: string | null
    emailConnected?: boolean
    providerReauthRequired?: boolean
  }
}

export type DashboardTasksSummary = {
  activePreview: DashboardTask[]
  pendingPreview: DashboardTask[]
  activeCount: number
  pendingCount: number
  priorityCounts: { critical: number; high: number; medium: number; low: number }
  upcomingCount: number
  aiAcceptance: { accepted: number; rejected: number; rate: number | null }
}

export type DashboardView = 'today' | 'week' | 'all'

export type DashboardFeedback = {
  label: string
  tone: 'success' | 'info' | 'warning' | 'neutral'
  message: string
}

export type DashboardSummary = {
  view: DashboardView
  stats: DashboardStats
  tasks: DashboardTasksSummary
  attentionEmails: DashboardEmail[]
  attentionEmailCount?: number
  momentum: Array<{
    date: string
    completedTasks: number
    createdTasks: number
    actionEmails: number
  }>
  feedback: DashboardFeedback
  allTime?: {
    stats: DashboardStats
    tasks: DashboardTasksSummary
  } | null
}

export type DashboardSummaryResponse = {
  data?: DashboardSummary
}

export const UNCATEGORIZED_ID = '__uncategorized__'
export const UNCATEGORIZED_OPTION = { id: UNCATEGORIZED_ID, name: 'Uncategorized' }

export const DASHBOARD_VIEWS: Array<{ id: DashboardView; label: string }> = [
  { id: 'week', label: 'This Week' },
  { id: 'today', label: 'Today' },
  { id: 'all', label: 'All Time' },
]
