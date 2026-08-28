import { authFetch } from './api'

export type TraceabilityStatus = 'covered' | 'failed' | 'skipped' | 'not_run'

export type TraceabilityTestCaseItem = {
  id: number
  code: string
  title: string
  status: TraceabilityStatus
  execution_id: number | null
  executed_at: string | null
  release_id: number | null
  release_version_name: string | null
}

export type TraceabilityRequirementItem = {
  id: number
  req_id: string
  version: number
  title: string
  module: string | null
  status: string
  is_uncovered: boolean
  coverage_percent: number
  test_cases: TraceabilityTestCaseItem[]
}

export type TraceabilityResponse = {
  items: TraceabilityRequirementItem[]
}

export async function getTraceability(projectId: number): Promise<TraceabilityResponse> {
  return authFetch<TraceabilityResponse>(`/traceability?project_id=${projectId}`)
}
