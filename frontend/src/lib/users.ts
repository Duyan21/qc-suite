import { authFetch } from './api'

export type SystemUser = {
  id: number
  email: string
  full_name: string | null
  is_active: boolean
  is_superadmin: boolean
  can_create_projects: boolean
  status: string
}

export async function listUsers(): Promise<SystemUser[]> {
  return authFetch<SystemUser[]>('/users')
}

export async function updateUserAccess(
  userId: number,
  payload: { is_superadmin?: boolean; can_create_projects?: boolean },
): Promise<SystemUser> {
  return authFetch<SystemUser>(`/users/${userId}`, { method: 'PATCH', body: payload })
}
