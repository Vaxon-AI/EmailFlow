import type { ReactNode } from "react"

import Link from "next/link"
import { CheckSquare, Clock, FolderOpen, Zap } from "lucide-react"

type AuthShellProps = {
  title: string
  description: string
  children: ReactNode
  footer?: ReactNode
}

const brandItems = [
  { icon: CheckSquare, text: "Tasks extracted from email threads" },
  { icon: FolderOpen, text: "Emails grouped by project automatically" },
  { icon: Clock, text: "Priorities and deadlines surfaced daily" },
]

export function AuthShell({
  title,
  description,
  children,
  footer,
}: AuthShellProps) {
  return (
    <div className="flex min-h-screen">
      <div className="relative hidden flex-col border-r bg-gray-50 p-12 lg:flex lg:w-[420px] xl:w-[480px]">
        <Link href="/landing" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="text-base font-bold text-gray-900">EmailFlow AI</span>
        </Link>

        <div className="mt-auto">
          <h2 className="text-2xl font-bold leading-snug text-gray-900">
            Your inbox, turned into
            <br />
            a clear action list
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-500">
            AI reads your emails, extracts what needs doing, and keeps everything organised by project.
          </p>

          <ul className="mt-8 space-y-4">
            {brandItems.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-gray-600">
                <Icon className="h-4 w-4 shrink-0 text-brand-600" />
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-12 text-xs text-gray-400">© {new Date().getFullYear()} EmailFlow AI</p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12">
        <div className="mb-8 lg:hidden">
          <Link href="/landing" className="inline-flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-bold text-gray-900">EmailFlow AI</span>
          </Link>
        </div>

        <div className="w-full max-w-[360px]">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          </div>

          {children}

          {footer ? <div className="mt-6">{footer}</div> : null}
        </div>
      </div>
    </div>
  )
}
