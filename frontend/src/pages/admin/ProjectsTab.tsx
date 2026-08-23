import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
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
import { createProject, listProjects, updateProject, type Project, type ProjectUpdatePayload } from '@/lib/projects'
import { listMembers, type Member } from '@/lib/members'

const DEFECT_WORKFLOW = ['Open', 'In Progress', 'Resolved', 'Closed']

function toSettingsForm(project: Project): ProjectUpdatePayload {
  return {
    name: project.name,
    description: project.description ?? undefined,
    key: project.key,
    lead_user_id: project.lead_user_id,
    modules: project.modules,
    status: project.status,
    require_requirement_link: project.require_requirement_link,
    auto_resolve_days: project.auto_resolve_days,
    ai_impact_suggestions: project.ai_impact_suggestions,
    slack_alerts_enabled: project.slack_alerts_enabled,
    retention_days: project.retention_days,
    default_severity: project.default_severity,
  }
}

export function ProjectsTab() {
  const toast = useToast()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [form, setForm] = useState<ProjectUpdatePayload | null>(null)
  const [moduleInput, setModuleInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)

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
      return
    }
    setForm(toSettingsForm(selected))
    listMembers(selected.id)
      .then(setMembers)
      .catch(() => setMembers([]))
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
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Không thể lưu cấu hình')
      })
      .finally(() => setSaving(false))
  }

  function addModule() {
    const value = moduleInput.trim()
    if (!value || !form || form.modules.includes(value)) return
    setForm({ ...form, modules: [...form.modules, value] })
    setModuleInput('')
  }

  function removeModule(mod: string) {
    if (!form) return
    setForm({ ...form, modules: form.modules.filter((m) => m !== mod) })
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
                      {form.modules.map((mod) => (
                        <button
                          key={mod}
                          type="button"
                          onClick={() => removeModule(mod)}
                          className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-accent"
                          title="Nhấn để xoá"
                        >
                          {mod} ×
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={moduleInput}
                        onChange={(e) => setModuleInput(e.target.value)}
                        placeholder="Thêm module..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addModule()
                          }
                        }}
                      />
                      <Button type="button" variant="outline" onClick={addModule}>
                        + Add
                      </Button>
                    </div>
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
                      { key: 'slack_alerts_enabled' as const, label: 'Cảnh báo Slack', hint: 'Gửi thông báo defect Critical vào #qa-alerts.' },
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

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs uppercase text-muted-foreground">Retention (ngày)</Label>
                      <Input
                        type="number"
                        value={form.retention_days}
                        onChange={(e) => setForm({ ...form, retention_days: Number(e.target.value) })}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
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
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setForm(toSettingsForm(selected))} disabled={saving}>
                      Reset
                    </Button>
                    <Button type="button" onClick={handleSaveSettings} disabled={saving}>
                      {saving ? 'Đang lưu...' : 'Save changes'}
                    </Button>
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
    </div>
  )
}
