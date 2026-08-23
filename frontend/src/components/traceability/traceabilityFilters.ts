import type { TraceabilityStatus, TraceabilityTestCaseItem } from '@/lib/traceability'
import type { CoverageBucket, DerivedRequirement } from './deriveTraceability'

export type RunStatusChip = 'run' | 'not_run' | 'skip'
export type CoverageFilterValue = 'all' | CoverageBucket

// Sentinel for "no module set" (backend `module` is nullable free text) —
// distinct from any real module name so it can be selected as its own
// filter bucket without colliding with actual data.
export const UNCATEGORIZED_MODULE = '__uncategorized__'

export type TraceabilityFilters = {
  search: string
  module: string
  coverage: CoverageFilterValue
  runStatusChips: ReadonlySet<RunStatusChip>
}

export const ALL_RUN_STATUS_CHIPS: readonly RunStatusChip[] = ['run', 'not_run', 'skip']

export const DEFAULT_FILTERS: TraceabilityFilters = {
  search: '',
  module: 'all',
  coverage: 'all',
  runStatusChips: new Set(ALL_RUN_STATUS_CHIPS),
}

// The "Run" chip covers both pass and fail outcomes — a test case that ran and
// failed is still something that "ran", distinct from 'skipped' or 'not_run'.
const CHIP_TO_STATUSES: Record<RunStatusChip, readonly TraceabilityStatus[]> = {
  run: ['covered', 'failed'],
  skip: ['skipped'],
  not_run: ['not_run'],
}

export function activeStatusesForChips(chips: ReadonlySet<RunStatusChip>): Set<TraceabilityStatus> {
  const result = new Set<TraceabilityStatus>()
  for (const chip of chips) {
    for (const status of CHIP_TO_STATUSES[chip]) result.add(status)
  }
  return result
}

export function filterTestCasesByStatus(
  testCases: readonly TraceabilityTestCaseItem[],
  chips: ReadonlySet<RunStatusChip>,
): TraceabilityTestCaseItem[] {
  const active = activeStatusesForChips(chips)
  return testCases.filter((tc) => active.has(tc.status))
}

function matchesSearch(req: DerivedRequirement, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (req.req_id.toLowerCase().includes(q) || req.title.toLowerCase().includes(q)) return true
  return req.test_cases.some(
    (tc) => tc.code.toLowerCase().includes(q) || tc.title.toLowerCase().includes(q),
  )
}

export function filterRequirements(
  items: readonly DerivedRequirement[],
  filters: TraceabilityFilters,
): DerivedRequirement[] {
  return items.filter((req) => {
    if (filters.module !== 'all') {
      const reqModule = req.module ?? UNCATEGORIZED_MODULE
      if (reqModule !== filters.module) return false
    }
    if (filters.coverage !== 'all' && req.coverageBucket !== filters.coverage) return false
    if (!matchesSearch(req, filters.search)) return false
    return true
  })
}
