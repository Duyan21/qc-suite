import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Plus, Search, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn, formatDate } from '@/lib/utils'
import { useToast } from '@/lib/toast'
import { getCurrentUser, type CurrentUser } from '@/lib/auth'
import {
  createProject,
  deleteProject,
  listProjects,
  updateProject,
  type Project,
  type ProjectUpdatePayload,
} from '@/lib/projects'
import { listMembers, type Member } from '@/lib/members'
import { useCurrentProject } from '@/lib/currentProject'
import { listModules, createModule, updateModule, deleteModule, type Module } from '@/lib/modules'

const DEFECT_WORKFLOW = ['Open', 'In Progress', 'Resolved', 'Closed']

function toSettingsForm(project: Project): ProjectUpdatePayload {
  return {
    name: project.name,
    description: project.description ?? undefined,
    key: project.key,
    lead_user_id: project.lead_user_id,
    status: project.status,
    require_requirement_link: project.require_requirement_link,
    auto_resolve_days: project.auto_resolve_days,
    ai_impact_suggestions: project.ai_impact_suggestions,
    default_severity: project.default_severity,
  }
}

export function ProjectsTab() {
  const toast = useToast()
  const { refresh: refreshCurrentProject } = useCurrentProject()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [form, setForm] = useState<ProjectUpdatePayload | null>(null)
  const [saving, setSaving] = useState(false)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [moduleList, setModuleList] = useState<Module[]>([])
  const [newModuleName, setNewModuleName] = useState('')
  const [moduleError, setModuleError] = useState<string | null>(null)
  const [editingModuleId, setEditingModuleId] = useState<number | null>(null)
  const [editingModuleName, setEditingModuleName] = useState('')

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null))
  }, [])

  function load() {
    setLoading(true)
    setError(null)
    listProjects()
      .then((list) => {
        setProjects(list)
        setSelectedId((current) => current ?? list[0]?.id ?? null)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
      })
      .finally(() => setLoading(false))
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q),
    )
  }, [projects, search])

  const selected = useMemo(
    () => projects.find((p) => p.id === selectedId) ?? null,
    [projects, selectedId],
  )

  useEffect(() => {
    if (!selected) {
      setForm(null)
      setMembers([])
      setModuleList([])
      return
    }
    setForm(toSettingsForm(selected))
    setNewModuleName('')
    setModuleError(null)
    setEditingModuleId(null)
    listMembers(selected.id)
      .then(setMembers)
      .catch(() => setMembers([]))
    listModules(selected.id)
      .then(setModuleList)
      .catch(() => setModuleList([]))
  }, [selected])

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Capture the form element synchronously — React nulls event.currentTarget
    // once this handler returns, so reading it inside .then() would throw.
    const formEl = event.currentTarget
    const formData = new FormData(formEl)
    const name = String(formData.get('name') ?? '').trim()
    const description = String(formData.get('description') ?? '').trim()
    if (!name) return

    setCreating(true)
    createProject({ name, description: description || undefined })
      .then((project) => {
        setProjects((prev) => [...prev, project])
        setSelectedId(project.id)
        setCreateOpen(false)
        formEl.reset()
        toast.success(`Đã tạo project "${project.name}"`)
        refreshCurrentProject().catch(() => {})
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Không thể tạo project')
      })
      .finally(() => setCreating(false))
  }

  function handleSaveSettings() {
    if (!selected || !form) return
    setSaving(true)
    updateProject(selected.id, form)
      .then((updated) => {
        setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
        toast.success('Đã lưu cấu hình project')
        refreshCurrentProject().catch(() => {})
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Không thể lưu cấu hình')
      })
      .finally(() => setSaving(false))
  }

  function handleAddModule() {
    if (!selected) return
    const name = newModuleName.trim()
    if (!name) {
      setModuleError('Vui lòng nhập tên module')
      return
    }
    setModuleError(null)
    createModule(selected.id, name)
      .then((module) => {
        setModuleList((prev) => [...prev, module])
        setNewModuleName('')
      })
      .catch((err) => {
        setModuleError(err instanceof Error ? err.message : 'Không thể thêm module')
      })
  }

  function startEditModule(module: Module) {
    setEditingModuleId(module.id)
    setEditingModuleName(module.name)
  }

  function cancelEditModule() {
    setEditingModuleId(null)
    setEditingModuleName('')
  }

  function saveEditModule(module: Module) {
    if (!selected) return
    const name = editingModuleName.trim()
    if (!name || name === module.name) {
      cancelEditModule()
      return
    }
    updateModule(selected.id, module.id, name)
      .then((updated) => {
        setModuleList((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
        cancelEditModule()
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Không thể đổi tên module')
      })
  }

  function handleDeleteProject() {
    if (!selected) return
    setDeleting(true)
    deleteProject(selected.id)
      .then(() => {
        setProjects((prev) => prev.filter((p) => p.id !== selected.id))
        setSelectedId((current) => (current === selected.id ? null : current))
        setDeleteOpen(false)
        toast.success(`Đã xoá project "${selected.name}"`)
        refreshCurrentProject().catch(() => {})
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Không thể xoá project')
      })
      .finally(() => setDeleting(false))
  }

  function handleDeleteModule(module: Module) {
    if (!selected) return
    deleteModule(selected.id, module.id)
      .then(() => {
        setModuleList((prev) => prev.filter((m) => m.id !== module.id))
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Không thể xoá module')
      })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-xl font-semibold">Administration</h1>
          <p className="text-sm text-muted-foreground">Quản lý projects trong hệ thống</p>
        </div>
        {(currentUser?.is_superadmin || currentUser?.can_create_projects) && (
          <Button type="button" onClick={() => setCreateOpen(true)} className="w-full sm:w-auto">
            <Plus />
            New project
          </Button>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Đang tải...</p>}
      {error && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={load}>
            Thử lại
          </Button>
        </div>
      )}

      {!loading && !error && (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <Card>
            <CardHeader className="gap-3">
              <CardTitle>Projects</CardTitle>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm project..."
                  className="pl-8"
                />
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 px-4">
              {filtered.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {projects.length === 0 ? 'Chưa có project nào.' : 'Không tìm thấy project phù hợp.'}
                </p>
              )}
              {filtered.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setSelectedId(project.id)}
                  className={cn(
                    'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors hover:bg-accent',
                    project.id === selectedId && 'border-primary bg-accent',
                  )}
                >
                  <span className="font-medium">{project.name}</span>
                  {project.description && (
                    <span className="line-clamp-2 text-xs text-muted-foreground">{project.description}</span>
                  )}
                  <span className="text-xs text-muted-foreground">Tạo lúc {formatDate(project.created_at)}</span>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cấu hình project</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 px-4">
              {!selected || !form ? (
                <p className="text-sm text-muted-foreground">Chọn một project để xem cấu hình.</p>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label>Project key</Label>
                      <Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Project lead</Label>
                      <select
                        className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                        value={form.lead_user_id ?? ''}
                        onChange={(e) =>
                          setForm({ ...form, lead_user_id: e.target.value ? Number(e.target.value) : null })
                        }
                      >
                        <option value="">Chưa chọn</option>
                        {members.map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.full_name ?? m.email}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs uppercase text-muted-foreground">Modules</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {moduleList.map((module) =>
                        editingModuleId === module.id ? (
                          <input
                            key={module.id}
                            autoFocus
                            value={editingModuleName}
                            onChange={(e) => setEditingModuleName(e.target.value)}
                            onBlur={() => saveEditModule(module)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                saveEditModule(module)
                              } else if (e.key === 'Escape') {
                                e.preventDefault()
                                cancelEditModule()
                              }
                            }}
                            className="rounded-full border px-2.5 py-0.5 text-xs"
                          />
                        ) : (
                          <span
                            key={module.id}
                            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs"
                          >
                            <button
                              type="button"
                              onClick={() => startEditModule(module)}
                              className="flex items-center gap-1 hover:underline"
                              title="Nhấn để đổi tên"
                            >
                              {module.name}
                              <Pencil className="size-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteModule(module)}
                              title="Xoá module"
                              className="hover:text-destructive"
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        ),
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={newModuleName}
                        onChange={(e) => {
                          setNewModuleName(e.target.value)
                          if (moduleError) setModuleError(null)
                        }}
                        placeholder="Thêm module..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddModule()
                          }
                        }}
                      />
                      <Button type="button" variant="outline" onClick={handleAddModule}>
                        + Add
                      </Button>
                    </div>
                    {moduleError && <p className="text-xs text-destructive">{moduleError}</p>}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs uppercase text-muted-foreground">Defect workflow</Label>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {DEFECT_WORKFLOW.map((stage, i) => (
                        <span key={stage} className="flex items-center gap-2">
                          <span className="rounded-md border px-2 py-1">{stage}</span>
                          {i < DEFECT_WORKFLOW.length - 1 && <span>→</span>}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <Label className="text-xs uppercase text-muted-foreground">Quy tắc & tích hợp</Label>
                    {[
                      { key: 'require_requirement_link' as const, label: 'Bắt buộc link requirement', hint: 'Defect phải liên kết ít nhất 1 requirement.' },
                      { key: 'ai_impact_suggestions' as const, label: 'AI Impact Agent', hint: 'Gợi ý test case bị ảnh hưởng khi requirement thay đổi.' },
                    ].map((toggle) => (
                      <div key={toggle.key} className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">{toggle.label}</div>
                          <div className="text-xs text-muted-foreground">{toggle.hint}</div>
                        </div>
                        <Switch
                          checked={form[toggle.key]}
                          onCheckedChange={(checked) => setForm({ ...form, [toggle.key]: checked })}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col gap-1.5 sm:w-1/2 sm:pr-1.5">
                    <Label className="text-xs uppercase text-muted-foreground">Severity mặc định</Label>
                    <select
                      className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                      value={form.default_severity}
                      onChange={(e) => setForm({ ...form, default_severity: e.target.value })}
                    >
                      {['Low', 'Medium', 'High', 'Critical'].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    {currentUser?.is_superadmin && (
                      <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
                        Delete project
                      </Button>
                    )}
                    <div className="ml-auto flex gap-2">
                      <Button type="button" variant="outline" onClick={() => setForm(toSettingsForm(selected))} disabled={saving}>
                        Reset
                      </Button>
                      <Button type="button" onClick={handleSaveSettings} disabled={saving}>
                        {saving ? 'Đang lưu...' : 'Save changes'}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={(open) => !creating && setCreateOpen(open)}>
        <DialogContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>New project</DialogTitle>
              <DialogDescription>Tạo một project mới trong hệ thống.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="project-name">Name</Label>
                <Input id="project-name" name="name" required placeholder="Core Banking Platform" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="project-description">Description</Label>
                <Textarea
                  id="project-description"
                  name="description"
                  placeholder="Hệ thống lõi: tài khoản, sổ cái, hạn mức và báo cáo cuối ngày."
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? 'Đang tạo...' : 'Create project'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xoá project?</DialogTitle>
            <DialogDescription>
              {selected && (
                <>
                  Project "{selected.name}" sẽ bị ẩn khỏi toàn bộ hệ thống. Hành động này không thể
                  hoàn tác từ giao diện.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDeleteProject} disabled={deleting}>
              {deleting ? 'Đang xoá...' : 'Delete project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
