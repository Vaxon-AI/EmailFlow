import { TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  formatMomentumDate,
  getFeedbackStatusClass,
  getMomentumPeriodLabel,
  getViewLabel,
  isLatestMomentumWindow,
} from './dashboard-helpers'
import type { DashboardFeedback, DashboardView } from './dashboard-types'

type MomentumPoint = {
  date: string
  completedTasks: number
  createdTasks: number
  actionEmails: number
}

export function CompletionMomentumCard({
  data,
  view,
  feedback,
  allTimeCompletedTasks,
  momentumEnd,
  onMomentumWindowChange,
}: {
  data: MomentumPoint[]
  view: DashboardView
  feedback?: DashboardFeedback
  allTimeCompletedTasks: number
  momentumEnd?: string | null
  onMomentumWindowChange?: (direction: 'previous' | 'next' | 'latest') => void
}) {
  const totalCompleted = data.reduce((sum, day) => sum + day.completedTasks, 0)
  const totalCreated = data.reduce((sum, day) => sum + day.createdTasks, 0)
  const totalActionEmails = data.reduce((sum, day) => sum + day.actionEmails, 0)
  const periodLabel = getMomentumPeriodLabel(view)
  const statusClass = getFeedbackStatusClass(feedback?.tone ?? 'neutral')

  return (
    <Card className="overflow-hidden border-gray-200/80 bg-white shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-brand-600" />
            Completion Momentum
          </CardTitle>
          {view === 'all' && onMomentumWindowChange ? (
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="utility" className="h-7 px-2 text-xs" onClick={() => onMomentumWindowChange('previous')}>
                Previous
              </Button>
              <Button
                size="sm"
                variant="utility"
                className="h-7 px-2 text-xs"
                onClick={() => onMomentumWindowChange('next')}
                disabled={isLatestMomentumWindow(momentumEnd)}
              >
                Next
              </Button>
              <Button size="sm" variant="utility" className="h-7 px-2 text-xs" onClick={() => onMomentumWindowChange('latest')}>
                Latest
              </Button>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] lg:items-center">
          {view === 'today' ? (
            <TodayMomentumSummary completed={totalCompleted} created={totalCreated} actionEmails={totalActionEmails} />
          ) : (
            <MomentumChart data={data} view={view} />
          )}
          <div className="space-y-3">
            {feedback ? (
              <div className={`rounded-xl border px-3 py-3 ${statusClass.wrapper}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-xl font-bold leading-tight ${statusClass.title}`}>{feedback.label}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass.badge}`}>
                    {getViewLabel(view)}
                  </span>
                </div>
                <p className={`mt-1 text-xs leading-5 ${statusClass.message}`}>{feedback.message}</p>
              </div>
            ) : null}
            <div>
              <p className="text-2xl font-bold text-slate-950">{totalCompleted}</p>
              <p className="text-sm font-medium text-slate-700">
                {totalCompleted === 0
                  ? 'No completed tasks yet'
                  : `task${totalCompleted === 1 ? '' : 's'} completed ${periodLabel}`}
              </p>
            </div>
            <p className="text-xs leading-5 text-slate-500">
              {totalCompleted === 0
                ? 'Finish a task to start your streak.'
                : view === 'all'
                  ? `${allTimeCompletedTasks} tasks completed overall.`
                  : 'Nice progress. Your workspace is moving forward.'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2">
                <p className="text-lg font-semibold text-slate-900">{totalCreated}</p>
                <p className="text-[11px] text-slate-500">tasks created</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2">
                <p className="text-lg font-semibold text-slate-900">{totalActionEmails}</p>
                <p className="text-[11px] text-slate-500">action emails</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TodayMomentumSummary({
  completed,
  created,
  actionEmails,
}: {
  completed: number
  created: number
  actionEmails: number
}) {
  return (
    <div className="grid min-h-52 gap-3 rounded-xl border border-gray-200 bg-white/80 p-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
      <div className="flex flex-col justify-between rounded-xl bg-brand-50 px-4 py-3">
        <span className="text-xs font-medium text-brand-700">Completed today</span>
        <span className="mt-5 text-3xl font-bold text-brand-700">{completed}</span>
      </div>
      <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
        <span className="text-xs font-medium text-slate-500">Tasks created</span>
        <span className="mt-5 text-3xl font-bold text-slate-900">{created}</span>
      </div>
      <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
        <span className="text-xs font-medium text-slate-500">Action emails</span>
        <span className="mt-5 text-3xl font-bold text-slate-900">{actionEmails}</span>
      </div>
    </div>
  )
}

function MomentumChart({
  data,
  view,
}: {
  data: MomentumPoint[]
  view: DashboardView
}) {
  const width = 640
  const height = 190
  const padding = { top: 18, right: 22, bottom: 34, left: 28 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const maxCompleted = Math.max(1, ...data.map((day) => day.completedTasks))
  const points = data.map((day, index) => {
    const x = padding.left + (data.length <= 1 ? 0 : (index / (data.length - 1)) * chartWidth)
    const y = padding.top + chartHeight - (day.completedTasks / maxCompleted) * chartHeight
    return { ...day, x, y }
  })
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`
      : ''
  const xLabels = points.filter((_, index) => index === 0 || index === Math.floor(points.length / 2) || index === points.length - 1)
  const yGrid = [0, 0.5, 1]

  return (
    <div className="rounded-xl border border-gray-200 bg-white/80 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Completed tasks ${getMomentumPeriodLabel(view)}`} className="h-52 w-full">
        <defs>
          <linearGradient id="momentum-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2A47C8" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#2A47C8" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {yGrid.map((ratio) => {
          const y = padding.top + chartHeight - ratio * chartHeight
          return (
            <line key={ratio} x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 6" />
          )
        })}
        {areaPath ? <path d={areaPath} fill="url(#momentum-fill)" /> : null}
        {linePath ? <path d={linePath} fill="none" stroke="#2A47C8" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" /> : null}
        {points.map((point) => (
          <g key={point.date} className="group outline-none" tabIndex={0}>
            <circle cx={point.x} cy={point.y} r="4" fill="#2A47C8" stroke="white" strokeWidth="2" />
            <circle cx={point.x} cy={point.y} r="12" fill="transparent" />
            <g className="pointer-events-none opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
              <rect x={Math.min(width - 150, Math.max(8, point.x - 68))} y={Math.max(8, point.y - 58)} width="136" height="44" rx="8" fill="#0f172a" />
              <text x={Math.min(width - 82, Math.max(76, point.x))} y={Math.max(26, point.y - 38)} textAnchor="middle" className="fill-white text-[11px] font-semibold">
                {formatMomentumDate(point.date)}
              </text>
              <text x={Math.min(width - 82, Math.max(76, point.x))} y={Math.max(42, point.y - 22)} textAnchor="middle" className="fill-slate-200 text-[10px]">
                {point.completedTasks} done / {point.createdTasks} new / {point.actionEmails} emails
              </text>
            </g>
          </g>
        ))}
        {xLabels.map((point) => (
          <text key={`label-${point.date}`} x={point.x} y={height - 10} textAnchor="middle" className="fill-slate-400 text-[10px]">
            {formatMomentumDate(point.date)}
          </text>
        ))}
      </svg>
    </div>
  )
}
