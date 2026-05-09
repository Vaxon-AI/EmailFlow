import type { ReactNode } from "react"

import { Loader2 } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type StatePanelProps = {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  variant?: "default" | "danger" | "success"
  loading?: boolean
  className?: string
}

const toneClasses: Record<NonNullable<StatePanelProps["variant"]>, string> = {
  default: "border-gray-200 bg-white text-gray-900",
  danger: "border-critical-100 bg-critical-50/60 text-red-900",
  success: "border-success-100 bg-success-50/60 text-green-900",
}

export function StatePanel({
  title,
  description,
  icon,
  action,
  variant = "default",
  loading = false,
  className,
}: StatePanelProps) {
  const resolvedIcon = loading ? (
    <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
  ) : (
    icon
  )

  return (
    <Card className={cn("animate-scale-in", toneClasses[variant], className)}>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        {resolvedIcon ? <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">{resolvedIcon}</div> : null}
        <div className="space-y-1">
          <p className="text-sm font-semibold">{title}</p>
          {description ? <p className="max-w-md text-sm text-gray-500">{description}</p> : null}
        </div>
        {action ? <div className="pt-1">{action}</div> : null}
      </CardContent>
    </Card>
  )
}
