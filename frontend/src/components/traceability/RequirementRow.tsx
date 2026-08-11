import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { TraceabilityStatus } from '@/lib/traceability'
import type { DerivedRequirement } from './deriveTraceability'
import { filterTestCasesByStatus, type RunStatusChip } from './traceabilityFilters'

const COVERAGE_BADGE_CLASS: Record<DerivedRequirement['coverageBucket'], string> = {
  full: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  none: 'bg-muted text-muted-foreground',
}

const COVERAGE_BADGE_LABEL: Record<DerivedRequirement['coverageBucket'], string> = {
  full: 'Tất cả pass',
  partial: 'Còn fail/chưa chạy',
  none: 'Không có TC',
}

const TC_STATUS_BADGE_CLASS: Record<TraceabilityStatus, string> = {
  covered: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  failed: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
  skipped: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  not_run: 'bg-muted text-muted-foreground',
}

const TC_STATUS_LABEL: Record<TraceabilityStatus, string> = {
  covered: 'Pass',
  failed: 'Fail',
  skipped: 'Skip',
  not_run: 'Not Run',
}

function formatRunDate(executedAt: string | null): string {
  if (!executedAt) return '—'
  const date = new Date(executedAt)
  if (Number.isNaN(date.getTime())) return '—'
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function RequirementRow({
  requirement,
  runStatusChips,
  expanded,
  onToggleExpand,
}: {
  requirement: DerivedRequirement
  runStatusChips: ReadonlySet<RunStatusChip>
  expanded: boolean
  onToggleExpand: () => void
}) {
  const total = requirement.test_cases.length
  const runCount = requirement.test_cases.filter((tc) => tc.status === 'covered' || tc.status === 'failed').length
  const progress = total === 0 ? 0 : runCount / total
  const visibleTestCases = filterTestCasesByStatus(requirement.test_cases, runStatusChips)

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        className="flex w-full flex-col gap-2 px-4 py-3 text-left hover:bg-muted/50"
      >
        <div className="flex flex-wrap items-center gap-2">
          {expanded ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
          <Link
            to={`/requirements/${requirement.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-primary underline-offset-4 hover:underline"
          >
            {requirement.req_id}
          </Link>
          <Badge className={COVERAGE_BADGE_CLASS[requirement.coverageBucket]}>
            {COVERAGE_BADGE_LABEL[requirement.coverageBucket]} · {total} TC
          </Badge>
          {requirement.failCount > 0 && (
            <Badge className="bg-destructive/10 text-destructive dark:bg-destructive/20">
              {requirement.failCount} fail
            </Badge>
          )}
          <span className="ml-auto text-xs text-muted-foreground">{requirement.mockModule}</span>
        </div>
        <div className="pl-6 text-sm">{requirement.title}</div>
        <div className="flex items-center gap-2 pl-6">
          <div className="h-1.5 w-40 max-w-[50%] overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">{runCount}/{total} run</span>
        </div>
      </button>
      {expanded && (
        <div className="flex flex-col gap-1.5 bg-muted/30 px-4 py-2 pl-10">
          {visibleTestCases.length === 0 && (
            <div className="py-1 text-xs text-muted-foreground">Không có test case khớp bộ lọc.</div>
          )}
          {visibleTestCases.map((tc) => (
            <div key={tc.id} className="flex items-center gap-2 py-1 text-sm">
              <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{tc.code}</span>
              <span className="flex-1 truncate">{tc.title}</span>
              <Badge className={cn(TC_STATUS_BADGE_CLASS[tc.status])}>{TC_STATUS_LABEL[tc.status]}</Badge>
              <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">
                {formatRunDate(tc.executed_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
