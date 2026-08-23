import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useToast } from '@/lib/toast'
import { getCurrentUser, type CurrentUser } from '@/lib/auth'
import { getPermissionMatrix, updatePermissionMatrix, type PermissionMatrix, type PermissionMatrixCell } from '@/lib/roles'

const AREAS: { key: string; label: string }[] = [
  { key: 'project_settings', label: 'Project settings' },
  { key: 'members_roles', label: 'Members & roles' },
  { key: 'requirements', label: 'Requirements' },
  { key: 'test_cases', label: 'Test cases' },
  { key: 'test_runs', label: 'Test runs' },
  { key: 'defects', label: 'Defects' },
  { key: 'ai_tools', label: 'AI tools & agents' },
  { key: 'audit_log', label: 'Audit log' },
]

const LEVEL_LABEL: Record<string, string> = { none: 'None', read: 'Read', edit: 'Edit', full: 'Full' }
const LEVEL_CYCLE: PermissionMatrixCell['level'][] = ['none', 'read', 'edit', 'full']
const LEVEL_BADGE_CLASS: Record<string, string> = {
  none: 'bg-muted text-muted-foreground',
  read: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  edit: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  full: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
}

export function RolesPermissionsTab() {
  const toast = useToast()
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getPermissionMatrix(), getCurrentUser()])
      .then(([m, user]) => {
        setMatrix(m)
        setCurrentUser(user)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Không thể tải ma trận quyền'))
      .finally(() => setLoading(false))
  }, [])

  const cellByRoleArea = useMemo(() => {
    const map = new Map<string, PermissionMatrixCell>()
    matrix?.cells.forEach((c) => map.set(`${c.role_key}:${c.area}`, c))
    return map
  }, [matrix])

  function handleCellClick(roleKey: string, area: string) {
    if (!matrix || !currentUser?.is_superadmin) return
    const current = cellByRoleArea.get(`${roleKey}:${area}`)?.level ?? 'none'
    const nextIndex = (LEVEL_CYCLE.indexOf(current) + 1) % LEVEL_CYCLE.length
    const nextLevel = LEVEL_CYCLE[nextIndex]

    const nextCells = matrix.cells.map((c) =>
      c.role_key === roleKey && c.area === area ? { ...c, level: nextLevel } : c,
    )
    setMatrix({ ...matrix, cells: nextCells })

    updatePermissionMatrix([{ role_key: roleKey, area, level: nextLevel }]).catch((err) => {
      toast.error(err instanceof Error ? err.message : 'Không thể cập nhật quyền')
      setMatrix(matrix) // revert on failure
    })
  }

  if (loading || !matrix) {
    return <p className="text-sm text-muted-foreground">Đang tải...</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {matrix.roles.map((role) => (
          <Card key={role.key}>
            <CardContent className="p-4">
              <div className="text-sm font-medium">{role.name}</div>
              <div className="text-xs text-muted-foreground">người dùng</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Permission matrix</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2 font-medium">Area</th>
                {matrix.roles.map((role) => (
                  <th key={role.key} className="px-4 py-2 text-center font-medium">{role.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AREAS.map((area) => (
                <tr key={area.key} className="border-b last:border-0">
                  <td className="px-4 py-2.5 font-medium">{area.label}</td>
                  {matrix.roles.map((role) => {
                    const level = cellByRoleArea.get(`${role.key}:${area.key}`)?.level ?? 'none'
                    return (
                      <td key={role.key} className="px-4 py-2.5 text-center">
                        <button
                          type="button"
                          disabled={!currentUser?.is_superadmin}
                          onClick={() => handleCellClick(role.key, area.key)}
                          className={cn(
                            'rounded-full px-2.5 py-0.5 text-xs font-medium',
                            LEVEL_BADGE_CLASS[level],
                            currentUser?.is_superadmin && 'cursor-pointer hover:opacity-80',
                          )}
                        >
                          {LEVEL_LABEL[level]}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Vai trò áp dụng theo từng project — một người có thể là QA Lead ở project này và Viewer ở project khác.
      </p>
    </div>
  )
}
