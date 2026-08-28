import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'
import { useToast } from '@/lib/toast'
import { getCurrentUser, type CurrentUser } from '@/lib/auth'
import { listUsers, updateUserAccess, type SystemUser } from '@/lib/users'

const PAGE_SIZE = 8

export function SystemAccessTab() {
  const toast = useToast()
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [users, setUsers] = useState<SystemUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    getCurrentUser()
      .then((user) => {
        setCurrentUser(user)
        if (!user.is_superadmin) return
        return listUsers().then(setUsers)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Không thể tải danh sách người dùng'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    setPage(1)
  }, [search])

  function handleUserToggle(userId: number, field: 'is_superadmin' | 'can_create_projects', value: boolean) {
    const previous = users.find((u) => u.id === userId)?.[field] ?? !value
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, [field]: value } : u)))
    updateUserAccess(userId, { [field]: value }).catch((err) => {
      toast.error(err instanceof Error ? err.message : 'Không thể cập nhật quyền hệ thống')
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, [field]: previous } : u)))
    })
  }

  function handleRetireToggle(user: SystemUser) {
    const nextActive = !user.is_active
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_active: nextActive } : u)))
    updateUserAccess(user.id, { is_active: nextActive })
      .then(() => toast.success(nextActive ? `Đã khôi phục ${user.email}` : `Đã cho nghỉ hưu ${user.email}`))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Không thể cập nhật trạng thái người dùng')
        setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_active: user.is_active } : u)))
      })
  }

  const sorted = useMemo(() => {
    return [...users].sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
      const nameA = a.full_name ?? a.email
      const nameB = b.full_name ?? b.email
      return nameA.localeCompare(nameB)
    })
  }, [users])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter(
      (u) => u.email.toLowerCase().includes(q) || (u.full_name ?? '').toLowerCase().includes(q),
    )
  }, [sorted, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (loading) {
    return <p className="text-sm text-muted-foreground">Đang tải...</p>
  }

  if (!currentUser?.is_superadmin) {
    return <p className="text-sm text-muted-foreground">Chỉ superadmin mới có thể xem trang này.</p>
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle>System access</CardTitle>
        <p className="text-xs text-muted-foreground">
          Quyền toàn hệ thống, không thuộc project nào — Superadmin quản lý mọi project và
          permission matrix; Can create projects chỉ cho phép tạo project mới.
        </p>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên, email..."
            className="pl-8"
          />
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Không tìm thấy người dùng.</p>
        ) : (
          <>
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">User</th>
                  <th className="px-4 py-2 font-medium">Superadmin</th>
                  <th className="px-4 py-2 font-medium">Can create projects</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((u) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar>
                          <AvatarFallback>{getInitials(u.full_name, u.email)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="font-medium">{u.full_name ?? u.email}</div>
                          <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Switch
                        checked={u.is_superadmin}
                        disabled={!u.is_active}
                        onCheckedChange={(checked) => handleUserToggle(u.id, 'is_superadmin', checked)}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <Switch
                        checked={u.can_create_projects}
                        disabled={!u.is_active}
                        onCheckedChange={(checked) => handleUserToggle(u.id, 'can_create_projects', checked)}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        className={
                          u.is_active
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                            : 'bg-muted text-muted-foreground'
                        }
                      >
                        {u.is_active ? 'Active' : 'Retired'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button size="sm" variant="outline" onClick={() => handleRetireToggle(u)}>
                        {u.is_active ? 'Retire' : 'Reactivate'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Trang {page}/{totalPages} — {filtered.length} người dùng
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Trước
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Sau
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
