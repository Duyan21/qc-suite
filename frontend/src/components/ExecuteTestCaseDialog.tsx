import { useState } from 'react'
import { X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { executeTestCase, type ExecutionHistoryItem, type ExecutionResult } from '@/lib/releases'

type ExecuteTestCaseDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  releaseId: number
  testCase: { id: number; code: string } | null
  onExecuted: (execution: ExecutionHistoryItem) => void
}

export function ExecuteTestCaseDialog({ open, onOpenChange, releaseId, testCase, onExecuted }: ExecuteTestCaseDialogProps) {
  const [result, setResult] = useState<ExecutionResult>('Pass')
  const [note, setNote] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setResult('Pass')
    setNote('')
    setImages([])
    setError(null)
  }

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList) return
    setImages((prev) => [...prev, ...Array.from(fileList)])
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    if (!testCase) return
    setSubmitting(true)
    setError(null)
    try {
      const execution = await executeTestCase(releaseId, testCase.id, { result, note: note || undefined, images })
      reset()
      onOpenChange(false)
      onExecuted(execution)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Thực thi {testCase?.code}</DialogTitle>
          <DialogDescription>Ghi nhận kết quả và đính kèm ảnh minh chứng (tùy chọn).</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={result === 'Pass' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setResult('Pass')}
            >
              Pass
            </Button>
            <Button
              type="button"
              variant={result === 'Fail' ? 'destructive' : 'outline'}
              className="flex-1"
              onClick={() => setResult('Fail')}
            >
              Fail
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="execute-note">Ghi chú</Label>
            <Textarea
              id="execute-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Mô tả kết quả, lỗi gặp phải..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="execute-images">Ảnh minh chứng</Label>
            <input
              id="execute-images"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              onChange={(e) => handleFilesSelected(e.target.files)}
              className="text-sm"
            />
            {images.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-2">
                {images.map((image, index) => (
                  <div key={`${image.name}-${index}`} className="relative">
                    <img
                      src={URL.createObjectURL(image)}
                      alt={image.name}
                      className="size-16 rounded-md object-cover ring-1 ring-border"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      aria-label="Xóa ảnh"
                      className="absolute -top-1.5 -right-1.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false) }}>
            Hủy
          </Button>
          <Button type="button" disabled={submitting} onClick={handleSubmit}>
            {submitting ? 'Đang lưu...' : 'Lưu kết quả'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
