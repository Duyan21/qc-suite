import { useEffect, useState, type FormEvent } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createRequirement, type Requirement, type RequirementStatus } from '@/lib/requirements'
import { listModules, type Module } from '@/lib/modules'

type NewRequirementDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  onCreated: (requirement: Requirement) => void
}

export function NewRequirementDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
}: NewRequirementDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modules, setModules] = useState<Module[]>([])
  const [modulesLoading, setModulesLoading] = useState(false)
  const [moduleId, setModuleId] = useState<string>('')
  const [invalidFields, setInvalidFields] = useState({
    title: false,
    description: false,
    module: false,
  })

  useEffect(() => {
    if (!open) return
    setModulesLoading(true)
    listModules(projectId)
      .then((list) => {
        setModules(list)
        setModuleId(list[0] ? String(list[0].id) : '')
      })
      .catch(() => setModules([]))
      .finally(() => setModulesLoading(false))
  }, [open, projectId])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const title = String(data.get('title') ?? '').trim()
    const description = String(data.get('description') ?? '').trim()
    const status = String(data.get('status') ?? 'Draft') as RequirementStatus

    const nextInvalid = {
      title: !title,
      description: !description,
      module: !moduleId,
    }
    if (nextInvalid.title || nextInvalid.description || nextInvalid.module) {
      setInvalidFields(nextInvalid)
      setError('Vui lòng điền đầy đủ các trường bắt buộc.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      // Create requirement with module_id
      const requirement = await createRequirement({
        project_id: projectId,
        title,
        description,
        module_id: Number(moduleId),
        status,
      })
      form.reset()
      setInvalidFields({ title: false, description: false, module: false })
      onOpenChange(false)
      onCreated(requirement)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
    } finally {
      setSubmitting(false)
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setError(null)
      setInvalidFields({ title: false, description: false, module: false })
    }
    onOpenChange(nextOpen)
  }

  const canSubmit = !submitting && !modulesLoading && modules.length > 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Requirement mới</DialogTitle>
            <DialogDescription>Tạo một requirement mới cho dự án hiện tại.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-req-title">Tiêu đề*</Label>
              <Input
                id="new-req-title"
                name="title"
                required
                aria-invalid={invalidFields.title}
                onChange={(event) => {
                  if (invalidFields.title && event.target.value.trim()) {
                    setInvalidFields((prev) => ({ ...prev, title: false }))
                  }
                }}
                placeholder="Nhập tiêu đề requirement..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-req-description">Mô tả*</Label>
              <Textarea
                id="new-req-description"
                name="description"
                required
                aria-invalid={invalidFields.description}
                onChange={(event) => {
                  if (invalidFields.description && event.target.value.trim()) {
                    setInvalidFields((prev) => ({ ...prev, description: false }))
                  }
                }}
                rows={4}
                placeholder="Mô tả chi tiết requirement..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-req-module">Module*</Label>
              <Select
                value={moduleId}
                onValueChange={(value) => {
                  setModuleId(value)
                  setError(null)
                  setInvalidFields((prev) => ({ ...prev, module: false }))
                }}
                disabled={modulesLoading || modules.length === 0}
              >
                <SelectTrigger
                  id="new-req-module"
                  className="w-full"
                  aria-invalid={invalidFields.module}
                >
                  <SelectValue placeholder={modules.length === 0 ? 'Chưa có module' : 'Chọn module...'} />
                </SelectTrigger>
                <SelectContent>
                  {modules.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!modulesLoading && modules.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Chưa có module nào. Thêm module trong Admin → Projects trước.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-req-status">Trạng thái</Label>
              <Select name="status" defaultValue="Draft">
                <SelectTrigger id="new-req-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Deprecated">Deprecated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? 'Đang tạo...' : 'Tạo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
