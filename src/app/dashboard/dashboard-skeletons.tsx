import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function DashboardPageFallback() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListCardSkeleton />
        <ListCardSkeleton />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCardSkeleton />
        <ChartCardSkeleton />
        <ChartCardSkeleton />
      </div>
    </div>
  )
}

export function StatCardSkeleton() {
  return (
    <Card className="border-gray-200/80 shadow-sm">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-4 rounded-full" />
        </div>
        <Skeleton className="mt-2 h-8 w-16" />
        <Skeleton className="mt-1 h-3 w-32" />
      </CardContent>
    </Card>
  )
}

export function ChartCardSkeleton() {
  return (
    <Card className="border-gray-200/80 shadow-sm">
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
        </div>
      </CardContent>
    </Card>
  )
}

export function MomentumCardSkeleton() {
  return (
    <Card className="border-gray-200/80 shadow-sm">
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-44" />
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] lg:items-end">
          <Skeleton className="h-44 w-full rounded-xl" />
          <div className="space-y-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function ListCardSkeleton() {
  return (
    <Card className="border-gray-200/80 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-12" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5">
              <Skeleton className="h-7 w-1 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
