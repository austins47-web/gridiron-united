import clsx from 'clsx'

/** A single pulsing placeholder bar/block, sized via className. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-md bg-field-700/60', className)} />
}

/** Mimics a standings row — rank, avatar circle, name, and a number on the right. */
export function StandingsRowSkeleton() {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <Skeleton className="w-4 h-3 shrink-0" />
      <Skeleton className="w-6 h-6 rounded-full shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-2.5 w-1/4" />
      </div>
      <Skeleton className="w-10 h-3 shrink-0" />
    </div>
  )
}

/** A handful of standings rows — the default "loading the standings panel" shape. */
export function StandingsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: rows }, (_, i) => <StandingsRowSkeleton key={i} />)}
    </div>
  )
}
