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
  executed_by_name: string | null
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

// Backend errors are English wire strings; only this layer knows which of them
// are user-facing, so it maps them to the UI's Vietnamese copy (same pattern as
// lib/auth.ts). The permission-check 403s are `Requires {level} on {area}` and
// this module only ever hits the test_runs area.
const ERROR_MESSAGES: Record<string, string> = {
  'No test cases resolved to add': 'Không có test case nào được thêm — kiểm tra lại lựa chọn của bạn.',
  'Requires read on test_runs': 'Bạn không có quyền xem Test Runs trong dự án này.',
  'Requires edit on test_runs': 'Bạn không có quyền chỉnh sửa Test Runs trong dự án này.',
  'Requires full on test_runs': 'Bạn không có quyền thực hiện thao tác này trong Test Runs.',
}

function toVietnameseError(err: unknown): Error {
  const message = err instanceof Error ? err.message : ''
  return new Error(ERROR_MESSAGES[message] ?? 'Đã có lỗi xảy ra, vui lòng thử lại.')
}

export async function listReleases(projectId: number): Promise<Release[]> {
  try {
    return await authFetch<Release[]>(`/releases?project_id=${projectId}`)
  } catch (err) {
    throw toVietnameseError(err)
  }
}

export async function createRelease(payload: {
  project_id: number
  version_name: string
  note?: string
  target_date?: string
  owner_user_id?: number
}): Promise<Release> {
  try {
    return await authFetch<Release>('/releases', { method: 'POST', body: payload })
  } catch (err) {
    throw toVietnameseError(err)
  }
}

export async function getRelease(id: number): Promise<Release> {
  try {
    return await authFetch<Release>(`/releases/${id}`)
  } catch (err) {
    throw toVietnameseError(err)
  }
}

export async function updateReleaseStatus(id: number, status: ReleaseStatus): Promise<Release> {
  try {
    return await authFetch<Release>(`/releases/${id}/status`, { method: 'PATCH', body: { status } })
  } catch (err) {
    throw toVietnameseError(err)
  }
}

export async function listReleaseTestCases(releaseId: number): Promise<ReleaseTestCaseItem[]> {
  try {
    return await authFetch<ReleaseTestCaseItem[]>(`/releases/${releaseId}/test-cases`)
  } catch (err) {
    throw toVietnameseError(err)
  }
}

export async function addTestCasesToRelease(
  releaseId: number,
  payload: { testcase_ids?: number[]; requirement_ids?: number[] },
): Promise<ReleaseTestCaseItem[]> {
  try {
    return await authFetch<ReleaseTestCaseItem[]>(`/releases/${releaseId}/test-cases`, {
      method: 'POST',
      body: payload,
    })
  } catch (err) {
    throw toVietnameseError(err)
  }
}

export async function removeTestCaseFromRelease(releaseId: number, testcaseId: number): Promise<void> {
  try {
    return await authFetch<void>(`/releases/${releaseId}/test-cases/${testcaseId}`, { method: 'DELETE' })
  } catch (err) {
    throw toVietnameseError(err)
  }
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
  try {
    return await authFetchMultipart<ExecutionHistoryItem>(
      `/releases/${releaseId}/test-cases/${testcaseId}/execute`,
      formData,
    )
  } catch (err) {
    throw toVietnameseError(err)
  }
}

export async function getExecutionHistory(releaseId: number, testcaseId: number): Promise<ExecutionHistoryItem[]> {
  try {
    return await authFetch<ExecutionHistoryItem[]>(`/releases/${releaseId}/test-cases/${testcaseId}/executions`)
  } catch (err) {
    throw toVietnameseError(err)
  }
}
