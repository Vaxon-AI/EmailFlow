'use client'

import Link from 'next/link'
import { ArrowUpRight, FlaskConical, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useDemoStore } from '@/lib/demo/store'

/**
 * Persistent strip that makes it unmistakable this is a no-stakes demo:
 * sample data, nothing is saved, and resetting / leaving is one click away.
 */
export function DemoBanner() {
  const { reset } = useDemoStore()

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 bg-brand-600 px-4 py-2 text-white">
      <span className="flex items-center gap-1.5 text-xs font-medium">
        <FlaskConical className="h-3.5 w-3.5 shrink-0" />
        You&apos;re exploring the EmailFlow demo — sample data, nothing here is saved.
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            reset()
            toast.success('Demo reset to its starting state')
          }}
          className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-white/25"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
        <Link
          href="/landing"
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-white/80 transition-colors hover:bg-white/15 hover:text-white"
        >
          Exit demo
        </Link>
        <Link
          href="/auth/signup"
          className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-700 transition-transform hover:-translate-y-px"
        >
          Create free account
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  )
}
