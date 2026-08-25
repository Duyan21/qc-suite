import { authFetch, authFetchMultipart } from './api'
import type { RequirementSummary } from './requirements'

export type ReleaseStatus = 'New' | 'InProgress' | 'Completed'
export type CurrentResult = 'NotRun' | 'Pass' | 'Fail'
export type ExecutionResult = 'Pass' | 'Fail'

export type Release = {
  id: number
  project_id: number
  version_name: string
  note: string | null
  status: ReleaseStatus
  target_date: string | null
  owner_user_id: number | null
  owner_name: string | null
  created_at: string
  total_test_cases: number
  pass_count: number
  fail_count: number
  not_run_count: number
}

export type ReleaseTestCaseTestCase = {
  id: number
  code: string
  title: string
  priority: string | null
  status: string
  requirement: RequirementSummary | null
}

export type ReleaseTestCaseItem = {
  id: number
  testcase: ReleaseTestCaseTestCase
  current_result: CurrentResult
  added_by_name: string | null
  added_at: string
}

export type EvidenceImageItem = {
  id: number
  url: string
}

export type ExecutionHistoryItem = {
  id: number
  result: ExecutionResult
  note: string | null
  executed_by_name: string | null
  executed_at: string
  images: EvidenceImageItem[]
}

export const RELEASE_STATUS_BADGE_CLASS: Record<string, string> = {
  New: 'bg-muted text-muted-foreground',
  InProgress: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  Completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
}

export const CURRENT_RESULT_BADGE_CLASS: Record<string, string> = {
  NotRun: 'bg-muted text-muted-foreground',
  Pass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  Fail: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
}

export async function listReleases(projectId: number): Promise<Release[]> {
  return authFetch<Release[]>(`/releases?project_id=${projectId}`)
}

export async function createRelease(payload: {
  project_id: number
  version_name: string
  note?: string
  target_date?: string
  owner_user_id?: number
}): Promise<Release> {
  return authFetch<Release>('/releases', { method: 'POST', body: payload })
}

export async function getRelease(id: number): Promise<Release> {
  return authFetch<Release>(`/releases/${id}`)
}

export async function updateReleaseStatus(id: number, status: ReleaseStatus): Promise<Release> {
  return authFetch<Release>(`/releases/${id}/status`, { method: 'PATCH', body: { status } })
}

export async function listReleaseTestCases(releaseId: number): Promise<ReleaseTestCaseItem[]> {
  return authFetch<ReleaseTestCaseItem[]>(`/releases/${releaseId}/test-cases`)
}

export async function addTestCasesToRelease(
  releaseId: number,
  payload: { testcase_ids?: number[]; requirement_ids?: number[] },
): Promise<ReleaseTestCaseItem[]> {
  return authFetch<ReleaseTestCaseItem[]>(`/releases/${releaseId}/test-cases`, {
    method: 'POST',
    body: payload,
  })
}

export async function removeTestCaseFromRelease(releaseId: number, testcaseId: number): Promise<void> {
  return authFetch<void>(`/releases/${releaseId}/test-cases/${testcaseId}`, { method: 'DELETE' })
}

export async function executeTestCase(
  releaseId: number,
  testcaseId: number,
  payload: { result: ExecutionResult; note?: string; images: File[] },
): Promise<ExecutionHistoryItem> {
  const formData = new FormData()
  formData.set('result', payload.result)
  if (payload.note) formData.set('note', payload.note)
  for (const image of payload.images) {
    formData.append('images', image)
  }
  return authFetchMultipart<ExecutionHistoryItem>(
    `/releases/${releaseId}/test-cases/${testcaseId}/execute`,
    formData,
  )
}

export async function getExecutionHistory(releaseId: number, testcaseId: number): Promise<ExecutionHistoryItem[]> {
  return authFetch<ExecutionHistoryItem[]>(`/releases/${releaseId}/test-cases/${testcaseId}/executions`)
}
