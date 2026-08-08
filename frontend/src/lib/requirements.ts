import { authFetch } from './api'

export type RequirementStatus = 'Draft' | 'Active' | 'Deprecated'

export type Requirement = {
  id: number
  req_id: string
  version: number
  title: string
  description: string
  status: string
  is_current: boolean
  change_note: string | null
  changed_by: string | null
  previous_version_id: number | null
  project_id: number
  created_at: string
}

export type RequirementListResponse = {
  items: Requirement[]
  total: number
  page: number
  limit: number
}

export type RequirementSummary = {
  id: number
  req_id: string
  version: number
  title: string
  status: string
}

export type RequirementListParams = {
  page?: number
  limit?: number
  status?: RequirementStatus
  search?: string
}

export const REQUIREMENT_STATUS_BADGE_CLASS: Record<string, string> = {
  Draft: 'bg-muted text-muted-foreground',
  Active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  Deprecated: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
}

export async function listRequirements(
  projectId: number,
  params: RequirementListParams = {},
): Promise<RequirementListResponse> {
  const query = new URLSearchParams({ project_id: String(projectId) })
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  if (params.status) query.set('status', params.status)
  if (params.search) query.set('search', params.search)
  return authFetch<RequirementListResponse>(`/requirements?${query.toString()}`)
}

export async function getRequirement(id: number): Promise<Requirement> {
  return authFetch<Requirement>(`/requirements/${id}`)
}

export async function getRequirementHistory(reqId: string): Promise<Requirement[]> {
  return authFetch<Requirement[]>(`/requirements/${encodeURIComponent(reqId)}/history`)
}
