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
import { removeTestCaseFromRelease } from '@/lib/releases'
import { useToast } from '@/lib/toast'

type RemoveTestCaseDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  releaseId: number
  testCase: { id: number; code: string } | null
  onRemoved: (testCaseId: number) => void
}

export function RemoveTestCaseDialog({ open, onOpenChange, releaseId, testCase, onRemoved }: RemoveTestCaseDialogProps) {
  const toast = useToast()
  const [submitting, setSubmitting] = useState(false)

  async function handleConfirm() {
    if (!testCase) return
    setSubmitting(true)
    try {
      await removeTestCaseFromRelease(releaseId, testCase.id)
      onOpenChange(false)
      onRemoved(testCase.id)
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
          <DialogTitle>Bỏ test case khỏi release?</DialogTitle>
          <DialogDescription>
            Bạn có chắc chắn muốn bỏ {testCase?.code} khỏi release này? Lịch sử thực thi của test case này trong
            release sẽ bị xóa.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="button" variant="destructive" disabled={submitting} onClick={handleConfirm}>
            {submitting ? 'Đang xóa...' : 'Bỏ khỏi release'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
