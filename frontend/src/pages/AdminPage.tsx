import { type FormEvent, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

type Role = 'Admin/QA Lead' | 'QA Engineer' | 'Product Owner' | 'Viewer' | 'Dev Integration'
type Status = 'Active' | 'Inactive'

interface AdminUser {
  id: number
  name: string
  email: string
  role: Role
  status: Status
  lastLogin: string
  createdAt: string
}

const ROLES: Role[] = ['Admin/QA Lead', 'QA Engineer', 'Product Owner', 'Viewer', 'Dev Integration']

const ROLE_BADGE_CLASS: Record<Role, string> = {
  'Admin/QA Lead': 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  'QA Engineer': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400',
  'Product Owner': 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  Viewer: 'bg-muted text-muted-foreground',
  'Dev Integration': 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
}

const STATUS_BADGE_CLASS: Record<Status, string> = {
  Active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  Inactive: 'bg-muted text-muted-foreground',
}

const AVATAR_COLORS = [
  'bg-violet-500',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-orange-500',
  'bg-rose-500',
  'bg-pink-500',
  'bg-indigo-500',
]

const initialUsers: AdminUser[] = [
  { id: 1, name: 'Nguyễn Thu Huyền', email: 'huyennguyen@hlp.vn', role: 'Admin/QA Lead', status: 'Active', lastLogin: '22/07 09:00', createdAt: '01/06/2025' },
  { id: 2, name: 'Lê Minh Khoa', email: 'khoale@hlp.vn', role: 'QA Engineer', status: 'Active', lastLogin: '22/07 08:45', createdAt: '15/06/2025' },
  { id: 3, name: 'Trần Văn An', email: 'antr@hlp.vn', role: 'QA Engineer', status: 'Active', lastLogin: '21/07 17:30', createdAt: '01/07/2025' },
  { id: 4, name: 'Phạm Ngọc Linh', email: 'linhpham@hlp.vn', role: 'QA Engineer', status: 'Active', lastLogin: '21/07 16:00', createdAt: '01/07/2025' },
  { id: 5, name: 'Đặng Thị Mai', email: 'maidt@hlp.vn', role: 'Viewer', status: 'Active', lastLogin: '18/07 10:00', createdAt: '15/07/2025' },
  { id: 6, name: 'Hoàng Anh Tuấn', email: 'tuanha@hlp.vn', role: 'Product Owner', status: 'Active', lastLogin: '22/07 09:15', createdAt: '01/06/2025' },
  { id: 7, name: 'Vũ Thị Bảo Châu', email: 'chauvtb@hlp.vn', role: 'Viewer', status: 'Inactive', lastLogin: '01/06 09:00', createdAt: '01/05/2025' },
  { id: 8, name: 'Bùi Thanh Hải', email: 'haibt@hlp.vn', role: 'Dev Integration', status: 'Active', lastLogin: '20/07 14:00', createdAt: '01/06/2025' },
]

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

export function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)

  function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const email = String(form.get('email') ?? '').trim()
    const role = String(form.get('role') ?? ROLES[0]) as Role
    if (!name || !email) return

    const today = new Date()
    const createdAt = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`

    setUsers((prev) => [
      ...prev,
      { id: Math.max(0, ...prev.map((u) => u.id)) + 1, name, email, role, status: 'Active', lastLogin: '—', createdAt },
    ])
    setInviteOpen(false)
    event.currentTarget.reset()
  }

  function handleEditSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingUser) return
    const form = new FormData(event.currentTarget)
    const role = String(form.get('role') ?? editingUser.role) as Role
    const status = String(form.get('status') ?? editingUser.status) as Status

    setUsers((prev) =>
      prev.map((u) => (u.id === editingUser.id ? { ...u, role, status } : u)),
    )
    setEditingUser(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-xl font-semibold">Admin Settings</h1>
          <p className="text-sm text-muted-foreground">Quản lý hệ thống và người dùng</p>
        </div>
        <Button type="button" onClick={() => setInviteOpen(true)} className="w-full sm:w-auto">
          <Plus />
          Invite User
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">User</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Last Login</TableHead>
                <TableHead className="hidden lg:table-cell">Created</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user, index) => (
                <TableRow key={user.id}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white',
                          AVATAR_COLORS[index % AVATAR_COLORS.length],
                        )}
                      >
                        {getInitials(user.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium">{user.name}</div>
                        <div className="truncate text-xs text-muted-foreground md:hidden">{user.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{user.email}</TableCell>
                  <TableCell>
                    <Badge className={ROLE_BADGE_CLASS[user.role]}>{user.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_BADGE_CLASS[user.status]}>{user.status}</Badge>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{user.lastLogin}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{user.createdAt}</TableCell>
                  <TableCell className="pr-4 text-right">
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditingUser(user)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <form onSubmit={handleInvite} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Invite User</DialogTitle>
              <DialogDescription>Thêm thành viên mới vào hệ thống.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-name">Name</Label>
                <Input id="invite-name" name="name" required placeholder="Nguyễn Văn A" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input id="invite-email" name="email" type="email" required placeholder="name@hlp.vn" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <Select name="role" defaultValue={ROLES[1]}>
                  <SelectTrigger id="invite-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Send Invite</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editingUser !== null} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          {editingUser && (
            <form onSubmit={handleEditSave} className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>Edit User</DialogTitle>
                <DialogDescription>{editingUser.name} · {editingUser.email}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-role">Role</Label>
                  <Select name="role" defaultValue={editingUser.role}>
                    <SelectTrigger id="edit-role" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select name="status" defaultValue={editingUser.status}>
                    <SelectTrigger id="edit-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>
                  Cancel
                </Button>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
