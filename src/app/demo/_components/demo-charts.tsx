// Pure presentational chart components for the demo dashboard.
// Adapted from the real dashboard's internal (non-exported) chart functions.
// No hooks, no network — just SVG and divs.

import Link from 'next/link'
import { cn } from '@/lib/utils'

export interface MomentumPoint {
  date: string
  completedTasks: number
  createdTasks: number
  actionEmails: number
}

export type MomentumView = 'today' | 'week' | 'all'

function formatMomentumDate(date: string): string {
  return new Date(date).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

export function DonutChart({ value, size, color }: { value: number; size: number; color: string }) {
  const r = (size - 12) / 2
  const circ = 2 * Math.PI * r
  const filled = (value / 100) * circ
  const half = size / 2

  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={half} cy={half} r={r} fill="none" stroke="#e5e7eb" strokeWidth={10} />
      <circle
        cx={half}
        cy={half}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={10}
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${half} ${half})`}
        className="transition-all duration-700"
      />
      <text
        x={half}
        y={half}
        textAnchor="middle"
        dominantBaseline="central"
        className="text-lg font-bold"
        fill="#1f2937"
      >
        {value}%
      </text>
    </svg>
  )
}

export function BarRow({
  label,
  value,
  max,
  color,
  href,
}: {
  label: string
  value: number
  max: number
  color: string
  /** When provided the row becomes a Link to the filtered view. */
  href?: string
}) {
  const pct = max > 0 ? (value / max) * 100 : 0
  const row = (
    <div
      className={cn(
        'flex items-center gap-3 rounded-md px-1 py-0.5 transition-colors',
        href && 'cursor-pointer hover:bg-brand-50/40',
      )}
    >
      <span className="w-24 text-xs text-gray-600">{label}</span>
      <div className="h-5 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs font-semibold text-gray-700">{value}</span>
    </div>
  )
  return href ? (
    <Link href={href} className="block">
      {row}
    </Link>
  ) : (
    row
  )
}

export function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-gray-600">{label}</span>
    </div>
  )
}

export function MomentumChart({ data, view = 'all' }: { data: MomentumPoint[]; view?: MomentumView }) {
  // Single-day "today" view: a smooth chart over one point is pointless.
  // Show a clean stat block instead — matches the real dashboard's today mode.
  if (view === 'today') {
    const last = data[data.length - 1]
    const todayCompleted = last?.completedTasks ?? 0
    const todayCreated = last?.createdTasks ?? 0
    const todayEmails = last?.actionEmails ?? 0
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white/80 px-6 py-10 text-center">
        <p className="text-6xl font-bold text-slate-900">{todayCompleted}</p>
        <p className="text-sm font-medium text-slate-600">
          task{todayCompleted === 1 ? '' : 's'} done today
        </p>
        <p className="mt-2 text-xs text-slate-400">
          {todayCreated} created · {todayEmails} action email{todayEmails === 1 ? '' : 's'}
        </p>
      </div>
    )
  }

  const width = 640
  const height = 190
  const padding = { top: 18, right: 22, bottom: 34, left: 28 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const maxCompleted = Math.max(1, ...data.map((d) => d.completedTasks))
  const points = data.map((day, index) => {
    const x = padding.left + (data.length <= 1 ? 0 : (index / (data.length - 1)) * chartWidth)
    const y = padding.top + chartHeight - (day.completedTasks / maxCompleted) * chartHeight
    return { ...day, x, y }
  })
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ')
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`
      : ''
  const xLabels = points.filter(
    (_, i) => i === 0 || i === Math.floor(points.length / 2) || i === points.length - 1,
  )
  const yGrid = [0, 0.5, 1]

  return (
    <div className="rounded-xl border border-gray-200 bg-white/80 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tasks completed per day" className="h-52 w-full">
        <defs>
          <linearGradient id="demo-momentum-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2A47C8" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#2A47C8" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {yGrid.map((ratio) => {
          const y = padding.top + chartHeight - ratio * chartHeight
          return (
            <line
              key={ratio}
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="#e2e8f0"
              strokeDasharray="4 6"
            />
          )
        })}
        {areaPath ? <path d={areaPath} fill="url(#demo-momentum-fill)" /> : null}
        {linePath ? (
          <path
            d={linePath}
            fill="none"
            stroke="#2A47C8"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        ) : null}
        {points.map((point) => (
          <g key={point.date} className="group outline-none" tabIndex={0}>
            <circle cx={point.x} cy={point.y} r="4" fill="#2A47C8" stroke="white" strokeWidth="2" />
            <circle cx={point.x} cy={point.y} r="12" fill="transparent" />
            <g className="pointer-events-none opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
              <rect
                x={Math.min(width - 150, Math.max(8, point.x - 68))}
                y={Math.max(8, point.y - 58)}
                width="136"
                height="44"
                rx="8"
                fill="#0f172a"
              />
              <text
                x={Math.min(width - 82, Math.max(76, point.x))}
                y={Math.max(26, point.y - 38)}
                textAnchor="middle"
                className="fill-white text-[11px] font-semibold"
              >
                {formatMomentumDate(point.date)}
              </text>
              <text
                x={Math.min(width - 82, Math.max(76, point.x))}
                y={Math.max(42, point.y - 22)}
                textAnchor="middle"
                className="fill-slate-200 text-[10px]"
              >
                {point.completedTasks} done / {point.createdTasks} new / {point.actionEmails} emails
              </text>
            </g>
          </g>
        ))}
        {xLabels.map((point) => (
          <text
            key={`label-${point.date}`}
            x={point.x}
            y={height - 10}
            textAnchor="middle"
            className="fill-slate-400 text-[10px]"
          >
            {formatMomentumDate(point.date)}
          </text>
        ))}
      </svg>
    </div>
  )
}
