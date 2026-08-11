import type { TraceabilityRequirementItem, TraceabilityStatus } from '@/lib/traceability'
import { mockModuleFor, type MockModule } from './mockModule'

export type CoverageBucket = 'none' | 'partial' | 'full'

export type DerivedRequirement = TraceabilityRequirementItem & {
  mockModule: MockModule
  coverageBucket: CoverageBucket
  failCount: number
  isFullyRun: boolean
}

export type TraceabilityStats = {
  coveragePercent: number
  coveredRequirementCount: number
  totalRequirementCount: number
  fullyRunCount: number
  executedTestCaseCount: number
  totalTestCaseCount: number
  coverageGapCount: number
}

// A requirement counts as "fully run" only once every linked test case has an
// actual pass/fail outcome — a lingering 'skipped' or 'not_run' still leaves
// it not fully run, even though 'skipped' counts toward "executed" below.
const PASS_FAIL_STATUSES: ReadonlySet<TraceabilityStatus> = new Set(['covered', 'failed'])

export function deriveRequirement(req: TraceabilityRequirementItem): DerivedRequirement {
  const total = req.test_cases.length
  const failCount = req.test_cases.filter((tc) => tc.status === 'failed').length
  const coverageBucket: CoverageBucket =
    total === 0 ? 'none' : req.coverage_percent === 1 ? 'full' : 'partial'
  const isFullyRun = total > 0 && req.test_cases.every((tc) => PASS_FAIL_STATUSES.has(tc.status))

  return {
    ...req,
    mockModule: mockModuleFor(req.id),
    coverageBucket,
    failCount,
    isFullyRun,
  }
}

export function deriveRequirements(items: TraceabilityRequirementItem[]): DerivedRequirement[] {
  return items.map(deriveRequirement)
}

export function computeTraceabilityStats(items: DerivedRequirement[]): TraceabilityStats {
  const totalRequirementCount = items.length
  const coveredRequirementCount = items.filter((r) => r.test_cases.length > 0).length
  const fullyRunCount = items.filter((r) => r.isFullyRun).length
  const allTestCases = items.flatMap((r) => r.test_cases)
  const totalTestCaseCount = allTestCases.length
  const executedTestCaseCount = allTestCases.filter((tc) => tc.status !== 'not_run').length
  const coverageGapCount = items.filter((r) => r.is_uncovered).length

  return {
    coveragePercent: totalRequirementCount === 0 ? 0 : coveredRequirementCount / totalRequirementCount,
    coveredRequirementCount,
    totalRequirementCount,
    fullyRunCount,
    executedTestCaseCount,
    totalTestCaseCount,
    coverageGapCount,
  }
}
