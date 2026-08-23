import { authFetch } from './api'

export type Member = {
  user_id: number
  email: string
  full_name: string | null
  status: string
  role_key: string
  role_name: string
  joined_at: string
}

export async function listMembers(projectId: number): Promise<Member[]> {
  return authFetch<Member[]>(`/projects/${projectId}/members`)
}

export async function inviteMember(
  projectId: number,
  payload: { email: string; full_name?: string; role_key: string },
): Promise<Member> {
  return authFetch<Member>(`/projects/${projectId}/members`, { method: 'POST', body: payload })
}

export async function updateMember(
  projectId: number,
  userId: number,
  payload: { role_key?: string; status?: string },
): Promise<Member> {
  return authFetch<Member>(`/projects/${projectId}/members/${userId}`, { method: 'PATCH', body: payload })
}

export async function removeMember(projectId: number, userId: number): Promise<void> {
  return authFetch<void>(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' })
}
