import type { ReactNode } from "react"

import {
  AlertCircle,
  CheckCircle2,
  Info,
  TriangleAlert,
} from "lucide-react"

import { cn } from "@/lib/utils"

type InlineNoticeProps = {
  children: ReactNode
  variant?: "error" | "success" | "info" | "warning"
  className?: string
}

const variantStyles = {
  error: {
    container: "border-critical-100 bg-critical-50 text-critical-700",
    icon: <AlertCircle className="h-4 w-4 shrink-0" />,
  },
  success: {
    container: "border-success-100 bg-success-50 text-success",
    icon: <CheckCircle2 className="h-4 w-4 shrink-0" />,
  },
  info: {
    container: "border-brand-200 bg-brand-50 text-brand-700",
    icon: <Info className="h-4 w-4 shrink-0" />,
  },
  warning: {
    container: "border-warning-100 bg-warning-50 text-warning-700",
    icon: <TriangleAlert className="h-4 w-4 shrink-0" />,
  },
}

export function InlineNotice({
  children,
  variant = "info",
  className,
}: InlineNoticeProps) {
  const config = variantStyles[variant]

  return (
    <div className={cn("flex items-center gap-2 rounded-lg border px-4 py-3 text-sm", config.container, className)}>
      {config.icon}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
