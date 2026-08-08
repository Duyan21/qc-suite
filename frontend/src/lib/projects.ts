import { authFetch } from './api'

export type Project = {
  id: number
  name: string
  description: string | null
  created_at: string
}

export async function listProjects(): Promise<Project[]> {
  return authFetch<Project[]>('/projects')
}
