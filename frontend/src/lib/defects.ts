import { authFetch } from './api'
import type { RequirementSummary } from './requirements'
import type { TestCaseSummary } from './testCases'

export type DefectSeverity = 'Critical' | 'High' | 'Medium' | 'Low'
export type DefectStatus = 'Open' | 'Fixed' | 'Closed' | 'Wont-Fix'

export type Defect = {
  id: number
  project_id: number
  code: string
  title: string
  description: string | null
  severity: string | null
  status: string
  testcase_id: number | null
  requirement_id: number | null
  found_in_version: string | null
  fixed_in_version: string | null
  created_at: string
}

export type DefectListItem = Defect & {
  test_case: TestCaseSummary | null
}

export type DefectDetail = Defect & {
  test_case: TestCaseSummary | null
  requirement: RequirementSummary | null
}

export type DefectListResponse = {
  items: DefectListItem[]
  total: number
  page: number
  limit: number
}

export type DefectStats = {
  total: number
  by_status: Record<string, number>
  by_severity: Record<string, number>
}

export type DefectListParams = {
  project_id?: number
  requirement_id?: number
  testcase_id?: number
  page?: number
  limit?: number
  severity?: DefectSeverity
  status?: DefectStatus
  search?: string
}

export const DEFECT_SEVERITY_BADGE_CLASS: Record<string, string> = {
  Critical: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  High: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  Medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  Low: 'bg-muted text-muted-foreground',
}

export const DEFECT_STATUS_BADGE_CLASS: Record<string, string> = {
  Open: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  Fixed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  Closed: 'bg-muted text-muted-foreground',
  'Wont-Fix': 'border border-input text-muted-foreground',
}

export async function listDefects(params: DefectListParams = {}): Promise<DefectListResponse> {
  const query = new URLSearchParams()
  if (params.project_id !== undefined) query.set('project_id', String(params.project_id))
  if (params.requirement_id !== undefined) query.set('requirement_id', String(params.requirement_id))
  if (params.testcase_id !== undefined) query.set('testcase_id', String(params.testcase_id))
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  if (params.severity) query.set('severity', params.severity)
  if (params.status) query.set('status', params.status)
  if (params.search) query.set('search', params.search)
  return authFetch<DefectListResponse>(`/defects?${query.toString()}`)
}

export async function getDefectStats(projectId: number): Promise<DefectStats> {
  return authFetch<DefectStats>(`/defects/stats?project_id=${projectId}`)
}

export async function getDefect(id: number): Promise<DefectDetail> {
  return authFetch<DefectDetail>(`/defects/${id}`)
}

export async function createDefect(payload: {
  project_id: number
  title: string
  description?: string
  severity: DefectSeverity
  status?: DefectStatus
  testcase_id?: number
  requirement_id?: number
}): Promise<Defect> {
  return authFetch<Defect>('/defects', { method: 'POST', body: payload })
}

export async function updateDefect(
  id: number,
  payload: { severity: DefectSeverity; status: DefectStatus; fixed_in_version?: string },
): Promise<Defect> {
  return authFetch<Defect>(`/defects/${id}`, { method: 'PUT', body: payload })
}
