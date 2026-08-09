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
import { deleteTestCase } from '@/lib/testCases'
import { useToast } from '@/lib/toast'

type DeleteTestCaseDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  testCase: { id: number; code: string } | null
  onDeleted: (id: number) => void
}

export function DeleteTestCaseDialog({
  open,
  onOpenChange,
  testCase,
  onDeleted,
}: DeleteTestCaseDialogProps) {
  const toast = useToast()
  const [submitting, setSubmitting] = useState(false)

  async function handleConfirm() {
    if (!testCase) return
    setSubmitting(true)
    try {
      await deleteTestCase(testCase.id)
      onOpenChange(false)
      onDeleted(testCase.id)
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
          <DialogTitle>Xóa test case?</DialogTitle>
          <DialogDescription>
            Bạn có chắc chắn muốn xóa test case {testCase?.code}?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
