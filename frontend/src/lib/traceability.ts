import { authFetch } from './api'

export type TraceabilityStatus = 'covered' | 'failed' | 'partial'

export type TraceabilityTestCaseItem = {
  id: number
  code: string
  title: string
  status: TraceabilityStatus
}

export type TraceabilityRequirementItem = {
  id: number
  req_id: string
  version: number
  title: string
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
