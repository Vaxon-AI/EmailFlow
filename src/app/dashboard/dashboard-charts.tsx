import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'

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
      <text x={half} y={half} textAnchor="middle" dominantBaseline="central" className="text-lg font-bold" fill="#1f2937">
        {value}%
      </text>
    </svg>
  )
}

export function BarRow({ label, value, max, color, href }: { label: string; value: number; max: number; color: string; href?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0

  const content = (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs text-gray-600">{label}</span>
      <div className="h-5 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-semibold text-gray-700">{value}</span>
    </div>
  )

  if (!href) return content

  return (
    <Link href={href} className="block rounded-md transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
      {content}
    </Link>
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

export function StatCard({ title, value, icon, detail, href }: { title: string; value: string | number; icon: React.ReactNode; detail: string; href?: string }) {
  const card = (
    <Card className={`border-gray-200/80 shadow-sm transition-all duration-200 ${href ? 'hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md' : ''}`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          {icon}
        </div>
        <p className="mt-1.5 text-2xl font-bold text-gray-900">{value}</p>
        <p className="mt-0.5 text-xs text-gray-400">{detail}</p>
      </CardContent>
    </Card>
  )

  if (!href) return card

  return (
    <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
      {card}
    </Link>
  )
}
