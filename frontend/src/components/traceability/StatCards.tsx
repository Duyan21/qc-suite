import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { TraceabilityStats } from './deriveTraceability'

function ProgressBar({ value, className }: { value: number; className?: string }) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
    </div>
  )
}

function StatCard({
  label,
  value,
  description,
  progress,
  emphasize = false,
}: {
  label: string
  value: string
  description: string
  progress?: number
  emphasize?: boolean
}) {
  return (
    <Card className="gap-1.5 p-4">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className={cn('text-2xl font-semibold', emphasize && 'text-destructive')}>{value}</div>
      <div className="text-xs text-muted-foreground">{description}</div>
      {progress !== undefined && <ProgressBar value={progress} className="mt-1" />}
    </Card>
  )
}

export function StatCards({ stats }: { stats: TraceabilityStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label="Coverage"
        value={`${Math.round(stats.coveragePercent * 100)}%`}
        description={`${stats.coveredRequirementCount} requirement có test case`}
        progress={stats.coveragePercent}
      />
      <StatCard
        label="Fully Run"
        value={String(stats.fullyRunCount)}
        description="requirement đã chạy hết TC"
      />
      <StatCard
        label="Execution"
        value={`${stats.executedTestCaseCount}/${stats.totalTestCaseCount}`}
        description="test case đã run"
        progress={stats.totalTestCaseCount === 0 ? 0 : stats.executedTestCaseCount / stats.totalTestCaseCount}
      />
      <StatCard
        label="Coverage Gap"
        value={String(stats.coverageGapCount)}
        description="requirement chưa có test case"
        emphasize
      />
    </div>
  )
}
