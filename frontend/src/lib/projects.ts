import { authFetch } from './api'

export type Project = {
  id: number
  name: string
  description: string | null
  key: string
  lead_user_id: number | null
  status: string
  require_requirement_link: boolean
  auto_resolve_days: number | null
  ai_impact_suggestions: boolean
  default_severity: string
  created_at: string
}

export type ProjectUpdatePayload = {
  name: string
  description?: string
  key: string
  lead_user_id?: number | null
  status: string
  require_requirement_link: boolean
  auto_resolve_days?: number | null
  ai_impact_suggestions: boolean
  default_severity: string
}

export async function listProjects(): Promise<Project[]> {
  return authFetch<Project[]>('/projects')
}

export async function getProject(id: number): Promise<Project> {
  return authFetch<Project>(`/projects/${id}`)
}

export async function createProject(payload: {
  name: string
  description?: string
}): Promise<Project> {
  return authFetch<Project>('/projects', { method: 'POST', body: payload })
}

export async function updateProject(id: number, payload: ProjectUpdatePayload): Promise<Project> {
  return authFetch<Project>(`/projects/${id}`, { method: 'PUT', body: payload })
}

export async function deleteProject(id: number): Promise<void> {
  await authFetch<void>(`/projects/${id}`, { method: 'DELETE' })
}
