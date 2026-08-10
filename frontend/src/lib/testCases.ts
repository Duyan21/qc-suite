import { authFetch } from './api'
import type { RequirementSummary } from './requirements'

export { REQUIREMENT_STATUS_BADGE_CLASS as TC_STATUS_BADGE_CLASS } from './requirements'

export type TestCaseStatus = 'Draft' | 'Active' | 'Deprecated'
export type TestCasePriority = 'High' | 'Medium' | 'Low'

export type TestCaseSummary = {
  id: number
  code: string
  title: string
  status: string
}

export type TestCaseListItem = {
  id: number
  code: string
  title: string
  priority: string | null
  status: string
  requirement_id: number | null
  requirement: RequirementSummary | null
  created_at: string
  updated_at: string
}

export type TestCase = {
  id: number
  code: string
  title: string
  preconditions: string | null
  steps: string | null
  expected_result: string
  priority: string | null
  status: string
  requirement_id: number | null
  created_at: string
  updated_at: string
}

export type TestCaseListResponse = {
  items: TestCaseListItem[]
  total: number
  page: number
  limit: number
}

export type TestCaseDetail = {
  id: number
  code: string
  title: string
  preconditions: string | null
  steps: string | null
  expected_result: string
  priority: string | null
  status: string
  requirement_id: number | null
  created_at: string
  updated_at: string
  requirement: RequirementSummary | null
}

export type TestCaseExecutionHistoryItem = {
  release_version: string
  result: string
  executed_at: string
  note: string | null
}

export type TestCaseListParams = {
  project_id?: number
  requirement_id?: number
  page?: number
  limit?: number
  status?: TestCaseStatus
  priority?: TestCasePriority
  search?: string
}

export const TC_PRIORITY_BADGE_CLASS: Record<string, string> = {
  High: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  Medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  Low: 'bg-muted text-muted-foreground',
}

export const EXECUTION_RESULT_BADGE_CLASS: Record<string, string> = {
  Pass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  Fail: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  Skip: 'bg-muted text-muted-foreground',
  Blocked: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
}

export async function getTestCase(id: number): Promise<TestCaseDetail> {
  return authFetch<TestCaseDetail>(`/test-cases/${id}`)
}

export async function getTestCaseResults(id: number): Promise<TestCaseExecutionHistoryItem[]> {
  return authFetch<TestCaseExecutionHistoryItem[]>(`/test-cases/${id}/results`)
}

export async function listTestCases(params: TestCaseListParams = {}): Promise<TestCaseListResponse> {
  const query = new URLSearchParams()
  if (params.project_id !== undefined) query.set('project_id', String(params.project_id))
  if (params.requirement_id !== undefined) query.set('requirement_id', String(params.requirement_id))
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  if (params.status) query.set('status', params.status)
  if (params.priority) query.set('priority', params.priority)
  if (params.search) query.set('search', params.search)
  return authFetch<TestCaseListResponse>(`/test-cases?${query.toString()}`)
}

export async function createTestCase(payload: {
  title: string
  preconditions?: string
  steps?: string
  expected_result: string
  priority: TestCasePriority
  requirement_id: number
}): Promise<TestCase> {
  return authFetch<TestCase>('/test-cases', { method: 'POST', body: payload })
}

export async function updateTestCase(
  id: number,
  payload: {
    title: string
    preconditions?: string
    steps?: string
    expected_result: string
    priority: TestCasePriority
    status: TestCaseStatus
    requirement_id: number
  },
): Promise<TestCase> {
  return authFetch<TestCase>(`/test-cases/${id}`, { method: 'PUT', body: payload })
}

export async function deleteTestCase(id: number): Promise<TestCase> {
  return authFetch<TestCase>(`/test-cases/${id}`, { method: 'DELETE' })
}
