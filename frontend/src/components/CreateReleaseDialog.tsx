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
import { createRelease, type Release } from '@/lib/releases'

type CreateReleaseDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  onCreated: (release: Release) => void
}

export function CreateReleaseDialog({ open, onOpenChange, projectId, onCreated }: CreateReleaseDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const version_name = String(data.get('version_name') ?? '').trim()
    const note = String(data.get('note') ?? '').trim()
    const target_date = String(data.get('target_date') ?? '').trim()

    setSubmitting(true)
    setError(null)
    try {
      const release = await createRelease({
        project_id: projectId,
        version_name,
        note: note || undefined,
        target_date: target_date || undefined,
      })
      form.reset()
      onOpenChange(false)
      onCreated(release)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Release mới</DialogTitle>
            <DialogDescription>
              Tạo một release để bắt đầu thêm test case và thực thi. <span className="text-destructive">*</span> Bắt buộc.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-release-name">
                Tên release <span className="text-destructive">*</span>
              </Label>
              <Input id="new-release-name" name="version_name" required placeholder="VD: Hotfix — Auth Fix" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-release-target">Ngày mục tiêu</Label>
              <Input id="new-release-target" name="target_date" type="date" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-release-note">Ghi chú</Label>
              <Textarea id="new-release-note" name="note" rows={2} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
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
