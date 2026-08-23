import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { UserPlus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'
import { useToast } from '@/lib/toast'
import { getCurrentUser, type CurrentUser } from '@/lib/auth'
import { listProjects, type Project } from '@/lib/projects'
import { listRoles, type Role } from '@/lib/roles'
import { listMembers, inviteMember, updateMember, removeMember, type Member } from '@/lib/members'

const STATUS_BADGE_CLASS: Record<string, string> = {
  Active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  Invited: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  Suspended: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
}

function getInitials(name: string | null, email: string): string {
  const source = (name ?? '').trim()
  if (!source) return email[0]?.toUpperCase() ?? '?'
  const parts = source.split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

export function UsersAccessTab() {
  const toast = useToast()
  const [projects, setProjects] = useState<Project[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [projectId, setProjectId] = useState<number | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const requestIdRef = useRef(0)

  // Simplification: the backend allows both superadmins and anyone with Edit on
  // members_roles for this project, but there's no endpoint exposing the
  // viewer's own per-project level yet, so gate the row actions on superadmin.
  const canManageMembers = currentUser?.is_superadmin === true

  useEffect(() => {
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null))
  }, [])

  useEffect(() => {
    Promise.all([listProjects(), listRoles()])
      .then(([projectList, roleList]) => {
        setProjects(projectList)
        setRoles(roleList)
        setProjectId(projectList[0]?.id ?? null)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Không thể tải dữ liệu'))
  }, [])

  useEffect(() => {
    if (projectId === null) {
      setMembers([])
      setLoading(false)
      return
    }
    const requestId = ++requestIdRef.current
    setLoading(true)
    listMembers(projectId)
      .then((list) => {
        if (requestIdRef.current !== requestId) return
        setMembers(list)
      })
      .catch((err) => {
        if (requestIdRef.current !== requestId) return
        toast.error(err instanceof Error ? err.message : 'Không thể tải thành viên')
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return
        setLoading(false)
      })
  }, [projectId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return members.filter((m) => {
      const matchesSearch =
        !q || m.email.toLowerCase().includes(q) || (m.full_name ?? '').toLowerCase().includes(q)
      const matchesRole = !roleFilter || m.role_key === roleFilter
      return matchesSearch && matchesRole
    })
  }, [members, search, roleFilter])

  const stats = useMemo(
    () => ({
      total: members.length,
      invited: members.filter((m) => m.status === 'Invited').length,
      suspended: members.filter((m) => m.status === 'Suspended').length,
    }),
    [members],
  )

  function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (projectId === null) return
    // Capture the form element synchronously — React nulls event.currentTarget
    // once this handler returns, so reading it inside .then() would throw.
    const formEl = event.currentTarget
    const formData = new FormData(formEl)
    const email = String(formData.get('email') ?? '').trim()
    const roleKey = String(formData.get('role_key') ?? roles[0]?.key ?? '')
    if (!email || !roleKey) return

    setInviting(true)
    inviteMember(projectId, { email, role_key: roleKey })
      .then((member) => {
        setMembers((prev) => [...prev, member])
        setInviteOpen(false)
        formEl.reset()
        toast.success(`Đã mời ${member.email}`)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Không thể mời thành viên'))
      .finally(() => setInviting(false))
  }

  function handleRoleChange(userId: number, roleKey: string) {
    if (projectId === null) return
    updateMember(projectId, userId, { role_key: roleKey })
      .then((updated) => setMembers((prev) => prev.map((m) => (m.user_id === userId ? updated : m))))
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Không thể đổi vai trò'))
  }

  function handleStatusToggle(member: Member) {
    if (projectId === null) return
    const nextStatus = member.status === 'Suspended' ? 'Active' : 'Suspended'
    updateMember(projectId, member.user_id, { status: nextStatus })
      .then((updated) => setMembers((prev) => prev.map((m) => (m.user_id === member.user_id ? updated : m))))
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Không thể đổi trạng thái'))
  }

  function handleRemove(userId: number) {
    if (projectId === null) return
    removeMember(projectId, userId)
      .then(() => setMembers((prev) => prev.filter((m) => m.user_id !== userId)))
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Không thể xoá thành viên'))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-xs uppercase text-muted-foreground">Project</Label>
          <select
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            value={projectId ?? ''}
            onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <Button type="button" onClick={() => setInviteOpen(true)} className="w-full sm:w-auto">
          <UserPlus />
          Invite user
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Thành viên', value: stats.total },
          { label: 'Đang chờ nhận lời mời', value: stats.invited },
          { label: 'Bị tạm ngưng', value: stats.suspended },
          { label: 'Vai trò', value: roles.length },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="text-2xl font-semibold">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle>Members</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm tên, email..."
                className="pl-8"
              />
            </div>
            <Select
              value={roleFilter ?? 'all'}
              onValueChange={(value) => setRoleFilter(value === 'all' ? null : value)}
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Mọi vai trò" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Mọi vai trò</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          {loading ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Đang tải...</p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Không có thành viên.</p>
          ) : (
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">User</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Joined</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((member) => (
                  <tr key={member.user_id} className="border-b last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar>
                          <AvatarFallback>{getInitials(member.full_name, member.email)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="font-medium">{member.full_name ?? member.email}</div>
                          <div className="truncate text-xs text-muted-foreground">{member.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        className="h-7 rounded-md border border-input bg-transparent px-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                        value={member.role_key}
                        disabled={!canManageMembers}
                        title={canManageMembers ? undefined : 'Bạn không có quyền quản lý thành viên'}
                        onChange={(e) => handleRoleChange(member.user_id, e.target.value)}
                      >
                        {roles.map((r) => (
                          <option key={r.key} value={r.key}>{r.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge className={STATUS_BADGE_CLASS[member.status] ?? ''}>{member.status}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{formatDate(member.joined_at)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canManageMembers}
                          title={canManageMembers ? undefined : 'Bạn không có quyền quản lý thành viên'}
                          onClick={() => handleStatusToggle(member)}
                        >
                          {member.status === 'Suspended' ? 'Reactivate' : 'Suspend'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canManageMembers}
                          title={canManageMembers ? undefined : 'Bạn không có quyền quản lý thành viên'}
                          onClick={() => handleRemove(member.user_id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={inviteOpen} onOpenChange={(open) => !inviting && setInviteOpen(open)}>
        <DialogContent>
          <form onSubmit={handleInvite} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Invite user</DialogTitle>
              <DialogDescription>Thêm thành viên mới vào project này.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input id="invite-email" name="email" type="email" required placeholder="name@company.vn" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <select id="invite-role" name="role_key" className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                  {roles.map((r) => (
                    <option key={r.key} value={r.key}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)} disabled={inviting}>
                Cancel
              </Button>
              <Button type="submit" disabled={inviting}>
                {inviting ? 'Đang gửi...' : 'Send invite'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
