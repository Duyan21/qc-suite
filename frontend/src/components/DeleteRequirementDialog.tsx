import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { deleteRequirement, type Requirement } from '@/lib/requirements'
import { useToast } from '@/lib/toast'

type DeleteRequirementDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  requirement: { id: number; req_id: string } | null
  onDeleted: (updated: Requirement) => void
}

export function DeleteRequirementDialog({
  open,
  onOpenChange,
  requirement,
  onDeleted,
}: DeleteRequirementDialogProps) {
  const toast = useToast()
  const [submitting, setSubmitting] = useState(false)

  async function handleConfirm() {
    if (!requirement) return
    setSubmitting(true)
    try {
      const updated = await deleteRequirement(requirement.id)
      onOpenChange(false)
      onDeleted(updated)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Xóa requirement?</DialogTitle>
          <DialogDescription>
            Bạn có chắc chắn muốn xóa requirement {requirement?.req_id}?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={submitting}
            onClick={handleConfirm}
          >
            {submitting ? 'Đang xóa...' : 'Xóa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
