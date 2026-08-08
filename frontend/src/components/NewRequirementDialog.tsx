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
import { createRequirement, type Requirement, type RequirementStatus } from '@/lib/requirements'

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const title = String(data.get('title') ?? '').trim()
    const description = String(data.get('description') ?? '').trim()
    const status = String(data.get('status') ?? 'Draft') as RequirementStatus

    setSubmitting(true)
    setError(null)
    try {
      const requirement = await createRequirement({
        project_id: projectId,
        title,
        description,
        status,
      })
      form.reset()
      onOpenChange(false)
      onCreated(requirement)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
    } finally {
      setSubmitting(false)
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setError(null)
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New Requirement</DialogTitle>
            <DialogDescription>Tạo một requirement mới cho dự án hiện tại.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-req-title">Title</Label>
              <Input
                id="new-req-title"
                name="title"
                required
                placeholder="Người dùng có thể đăng nhập bằng email"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-req-description">Description</Label>
              <Textarea
                id="new-req-description"
                name="description"
                required
                rows={4}
                placeholder="Mô tả chi tiết requirement..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-req-status">Status</Label>
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
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Đang tạo...' : 'Tạo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
