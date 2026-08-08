import { authFetch } from './api'

export type Defect = {
  id: number
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

export type DefectListResponse = {
  items: Defect[]
  total: number
  page: number
  limit: number
}

export async function listDefects(
  params: { requirement_id?: number; page?: number; limit?: number } = {},
): Promise<DefectListResponse> {
  const query = new URLSearchParams()
  if (params.requirement_id !== undefined) query.set('requirement_id', String(params.requirement_id))
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  return authFetch<DefectListResponse>(`/defects?${query.toString()}`)
}
