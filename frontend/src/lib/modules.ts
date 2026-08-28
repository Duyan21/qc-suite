import { authFetch } from './api'

export type Module = {
  id: number
  project_id: number
  name: string
  created_at: string
}

export async function listModules(projectId: number): Promise<Module[]> {
  return authFetch<Module[]>(`/projects/${projectId}/modules`)
}

export async function createModule(projectId: number, name: string): Promise<Module> {
  return authFetch<Module>(`/projects/${projectId}/modules`, { method: 'POST', body: { name } })
}

export async function updateModule(projectId: number, moduleId: number, name: string): Promise<Module> {
  return authFetch<Module>(`/projects/${projectId}/modules/${moduleId}`, { method: 'PATCH', body: { name } })
}

export async function deleteModule(projectId: number, moduleId: number): Promise<void> {
  return authFetch<void>(`/projects/${projectId}/modules/${moduleId}`, { method: 'DELETE' })
}
