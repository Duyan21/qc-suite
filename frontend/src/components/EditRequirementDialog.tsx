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
import { updateRequirement, type Requirement, type RequirementStatus } from '@/lib/requirements'
import { listModules, type Module } from '@/lib/modules'
import { useToast } from '@/lib/toast'

type EditRequirementDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  requirement: Requirement
  onUpdated: (updated: Requirement) => void
}

export function EditRequirementDialog({
  open,
  onOpenChange,
  requirement,
  onUpdated,
}: EditRequirementDialogProps) {
  const toast = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [modules, setModules] = useState<Module[]>([])
  const [modulesLoading, setModulesLoading] = useState(false)
  const [moduleId, setModuleId] = useState<string>(
    requirement.module_id !== null ? String(requirement.module_id) : '',
  )

  useEffect(() => {
    if (!open) return
    setModuleId(requirement.module_id !== null ? String(requirement.module_id) : '')
    setModulesLoading(true)
    listModules(requirement.project_id)
      .then((list) => {
        setModules(list)
        setModuleId((current) => current || (list[0] ? String(list[0].id) : ''))
      })
      .catch(() => setModules([]))
      .finally(() => setModulesLoading(false))
  }, [open, requirement.project_id, requirement.module_id])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!moduleId) return
    const form = event.currentTarget
    const data = new FormData(form)
    const title = String(data.get('title') ?? '').trim()
    const description = String(data.get('description') ?? '').trim()
    const status = String(data.get('status') ?? requirement.status) as RequirementStatus
    const changeNote = String(data.get('change_note') ?? '').trim()

    setSubmitting(true)
    try {
      // Update requirement with module_id
      const updated = await updateRequirement(requirement.id, {
        title,
        description,
        module_id: Number(moduleId),
        status,
        change_note: changeNote || undefined,
      })
      onOpenChange(false)
      onUpdated(updated)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !submitting && !modulesLoading && modules.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Sửa Requirement</DialogTitle>
            <DialogDescription>
              Cập nhật thông tin requirement {requirement.req_id}. Lưu sẽ tạo phiên bản mới; các test
              case đã liên kết vẫn giữ nguyên ở phiên bản cũ.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-req-title">Tiêu đề</Label>
              <Input
                id="edit-req-title"
                name="title"
                required
                defaultValue={requirement.title}
                placeholder="Nhập tiêu đề requirement..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-req-description">Mô tả</Label>
              <Textarea
                id="edit-req-description"
                name="description"
                required
                rows={4}
                defaultValue={requirement.description}
                placeholder="Mô tả chi tiết requirement..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-req-module">Module</Label>
              <Select
                value={moduleId}
                onValueChange={setModuleId}
                disabled={modulesLoading || modules.length === 0}
              >
                <SelectTrigger id="edit-req-module" className="w-full">
                  <SelectValue placeholder={modules.length === 0 ? 'Chưa có module' : undefined} />
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
              <Label htmlFor="edit-req-status">Trạng thái</Label>
              <Select name="status" defaultValue={requirement.status}>
                <SelectTrigger id="edit-req-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Deprecated">Deprecated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-req-change-note">Ghi chú thay đổi (tùy chọn)</Label>
              <Textarea
                id="edit-req-change-note"
                name="change_note"
                rows={2}
                placeholder="Lý do thay đổi..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
