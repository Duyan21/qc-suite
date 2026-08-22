import { authFetch } from './api'

export type Role = {
  id: number
  key: string
  name: string
}

export type PermissionMatrixCell = {
  role_key: string
  area: string
  level: 'none' | 'read' | 'edit' | 'full'
}

export type PermissionMatrix = {
  roles: Role[]
  cells: PermissionMatrixCell[]
}

export async function listRoles(): Promise<Role[]> {
  return authFetch<Role[]>('/roles')
}

export async function getPermissionMatrix(): Promise<PermissionMatrix> {
  return authFetch<PermissionMatrix>('/permissions/matrix')
}

export async function updatePermissionMatrix(cells: PermissionMatrixCell[]): Promise<PermissionMatrix> {
  return authFetch<PermissionMatrix>('/permissions/matrix', {
    method: 'PUT',
    body: { cells },
  })
}
