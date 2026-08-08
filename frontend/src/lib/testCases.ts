import { authFetch } from './api'
import type { RequirementSummary } from './requirements'

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

export const TC_PRIORITY_BADGE_CLASS: Record<string, string> = {
  High: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  Medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  Low: 'bg-muted text-muted-foreground',
}

export const TC_STATUS_BADGE_CLASS: Record<string, string> = {
  Draft: 'bg-muted text-muted-foreground',
  Active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  Deprecated: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
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
