'use client'

import { useState } from 'react'
import { BarChart2, Zap } from 'lucide-react'
import { UpgradeModal } from '@/components/upgrade-modal'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type QuotaStatus = {
  classify: { used: number; limit: number | null; resetAt: string }
  extract: { used: number; limit: number | null; resetAt: string }
  pasteText?: { used: number; limit: number | null; resetAt: string }
}

type SettingsPlanUsageCardProps = {
  plan?: string | null
  quota?: QuotaStatus
}

function getQuotaBarClass(used: number, limit: number, warningThreshold: number, normalClass: string) {
  const ratio = used / limit
  if (ratio >= 1) return 'bg-critical'
  if (ratio >= warningThreshold) return 'bg-warning'
  return normalClass
}

function QuotaMeter({
  label,
  used,
  limit,
  warningThreshold,
  normalClass,
  limitReachedMessage,
}: {
  label: string
  used: number
  limit: number | null
  warningThreshold: number
  normalClass: string
  limitReachedMessage: string
}) {
  if (limit === null) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm tabular-nums text-gray-500">
          {used} / {limit}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={cn('h-full rounded-full transition-all', getQuotaBarClass(used, limit, warningThreshold, normalClass))}
          style={{ width: `${Math.min(100, (used / limit) * 100)}%` }}
        />
      </div>
      {used >= limit && <p className="text-xs text-critical">{limitReachedMessage}</p>}
    </div>
  )
}

export function SettingsPlanUsageCard({ plan, quota }: SettingsPlanUsageCardProps) {
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const isPro = plan === 'pro'

  return (
    <>
      <Card className="border-white/80 bg-white/95 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart2 className="h-4 w-4 text-brand-700" />
            Plan &amp; Usage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isPro ? (
                <Badge className="gap-1.5 bg-brand-600 text-white hover:bg-brand-600">
                  <Zap className="h-3 w-3" />
                  Pro
                </Badge>
              ) : (
                <Badge variant="outline" className="border-gray-200 text-gray-600">
                  Free
                </Badge>
              )}
              <span className="text-sm text-gray-500">
                {isPro ? 'Unlimited access to all features' : 'Monthly usage limits apply'}
              </span>
            </div>
            {!isPro && (
              <button
                onClick={() => setUpgradeOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
              >
                <Zap className="h-3.5 w-3.5" />
                Upgrade to Pro
              </button>
            )}
          </div>

          {quota && !isPro && (
            <div className="space-y-4 rounded-2xl border border-gray-200/80 bg-gray-50/70 p-4">
              <QuotaMeter
                label="Email classification"
                used={quota.classify.used}
                limit={quota.classify.limit}
                warningThreshold={0.7}
                normalClass="bg-brand-500"
                limitReachedMessage="Limit reached. Upgrade to Pro for unlimited classification."
              />
              <QuotaMeter
                label="Extract to task"
                used={quota.extract.used}
                limit={quota.extract.limit}
                warningThreshold={0.67}
                normalClass="bg-brand-500"
                limitReachedMessage="Limit reached. Upgrade to Pro for unlimited extractions."
              />
              {quota.pasteText && (
                <QuotaMeter
                  label="Paste Text"
                  used={quota.pasteText.used}
                  limit={quota.pasteText.limit}
                  warningThreshold={0.67}
                  normalClass="bg-ai"
                  limitReachedMessage="Limit reached. Upgrade to Pro for unlimited Paste Text extraction."
                />
              )}
              <p className="text-xs text-gray-400">
                Resets on{' '}
                {new Date(quota.classify.resetAt).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>
          )}

          {isPro && (
            <div className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-brand-700">Pro plan active</p>
                <p className="text-xs text-brand-600">All features unlocked with no usage limits.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </>
  )
}
