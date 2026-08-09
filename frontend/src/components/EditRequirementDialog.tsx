import { useState, type FormEvent } from 'react'
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const title = String(data.get('title') ?? '').trim()
    const description = String(data.get('description') ?? '').trim()
    const status = String(data.get('status') ?? requirement.status) as RequirementStatus
    const changeNote = String(data.get('change_note') ?? '').trim()

    setSubmitting(true)
    try {
      const updated = await updateRequirement(requirement.id, {
        title,
        description,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Sửa Requirement</DialogTitle>
            <DialogDescription>Cập nhật thông tin requirement {requirement.req_id}.</DialogDescription>
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
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
