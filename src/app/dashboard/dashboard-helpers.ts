import { DASHBOARD_VIEWS, type DashboardFeedback, type DashboardView } from './dashboard-types'

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function parseContextParam(params: URLSearchParams, key: string) {
  return params
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean)
}

export function parseDashboardView(value: string | null): DashboardView {
  return value === 'today' || value === 'all' ? value : 'week'
}

export function parseMomentumEnd(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : value
}

export function setMultiParam(params: URLSearchParams, key: string, values: string[]) {
  params.delete(key)
  if (values.length > 0) params.set(key, values.join(','))
}

export function getViewLabel(view: DashboardView) {
  return DASHBOARD_VIEWS.find((item) => item.id === view)?.label ?? 'This Week'
}

export function getViewPeriodLabel(view: DashboardView) {
  if (view === 'today') return 'Today'
  if (view === 'week') return 'This week'
  return 'All time'
}

export function getMomentumPeriodLabel(view: DashboardView) {
  if (view === 'today') return 'today'
  if (view === 'week') return 'this week'
  return 'in the last 14 days'
}

export function getFeedbackStatusClass(tone: DashboardFeedback['tone']) {
  if (tone === 'success') {
    return {
      wrapper: 'border-success-100 bg-success-50',
      title: 'text-success',
      message: 'text-success',
      badge: 'bg-white/80 text-success',
    }
  }
  if (tone === 'info') {
    return {
      wrapper: 'border-brand-100 bg-brand-50',
      title: 'text-brand-700',
      message: 'text-brand-700',
      badge: 'bg-white/80 text-brand-700',
    }
  }
  if (tone === 'warning') {
    return {
      wrapper: 'border-warning-200 bg-warning-100/60',
      title: 'text-warning-700',
      message: 'text-warning',
      badge: 'bg-white/80 text-warning',
    }
  }
  return {
    wrapper: 'border-slate-200 bg-slate-50',
    title: 'text-slate-950',
    message: 'text-slate-600',
    badge: 'bg-white text-slate-600',
  }
}

export function formatMomentumDate(date: string) {
  const [, month, day] = date.split('-')
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${monthLabels[Math.max(0, Number(month) - 1)]} ${Number(day)}`
}

export function startOfLocalDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

export function addLocalDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return startOfLocalDay(next)
}

export function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isLatestMomentumWindow(momentumEnd?: string | null) {
  if (!momentumEnd) return true
  return momentumEnd >= formatDateKey(new Date())
}
