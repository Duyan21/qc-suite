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
import { RequirementCombobox } from '@/components/RequirementCombobox'
import { TestCaseCombobox } from '@/components/TestCaseCombobox'
import type { RequirementSummary } from '@/lib/requirements'
import type { TestCaseSummary } from '@/lib/testCases'
import { createDefect, type Defect, type DefectSeverity, type DefectStatus } from '@/lib/defects'

type NewDefectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  defaultSeverity: DefectSeverity
  onCreated: (defect: Defect) => void
}

export function NewDefectDialog({ open, onOpenChange, projectId, defaultSeverity, onCreated }: NewDefectDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedRequirement, setSelectedRequirement] = useState<RequirementSummary | null>(null)
  const [selectedTestCase, setSelectedTestCase] = useState<TestCaseSummary | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const title = String(data.get('title') ?? '').trim()
    const description = String(data.get('description') ?? '').trim()
    const severity = String(data.get('severity') ?? defaultSeverity) as DefectSeverity
    const status = String(data.get('status') ?? 'Open') as DefectStatus

    setSubmitting(true)
    setError(null)
    try {
      const defect = await createDefect({
        project_id: projectId,
        title,
        description: description || undefined,
        severity,
        status,
        testcase_id: selectedTestCase?.id,
        requirement_id: selectedRequirement?.id,
      })
      form.reset()
      setSelectedRequirement(null)
      setSelectedTestCase(null)
      onOpenChange(false)
      onCreated(defect)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
    } finally {
      setSubmitting(false)
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setError(null)
      setSelectedRequirement(null)
      setSelectedTestCase(null)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Log Defect</DialogTitle>
            <DialogDescription>Ghi nhận một defect mới.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-defect-title">Tiêu đề</Label>
              <Input
                id="new-defect-title"
                name="title"
                required
                placeholder="Nhập tiêu đề defect..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-defect-description">Mô tả</Label>
              <Textarea
                id="new-defect-description"
                name="description"
                rows={3}
                placeholder="Các bước tái hiện, kết quả thực tế..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-defect-severity">Mức độ nghiêm trọng</Label>
              <Select key={defaultSeverity} name="severity" defaultValue={defaultSeverity}>
                <SelectTrigger id="new-defect-severity" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Critical">Critical</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-defect-status">Trạng thái</Label>
              <Select name="status" defaultValue="Open">
                <SelectTrigger id="new-defect-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="Fixed">Fixed</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                  <SelectItem value="Wont-Fix">Wont-Fix</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Link Test Case (tùy chọn)</Label>
              <TestCaseCombobox projectId={projectId} value={selectedTestCase} onChange={setSelectedTestCase} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Link Requirement (tùy chọn)</Label>
              <RequirementCombobox projectId={projectId} value={selectedRequirement} onChange={setSelectedRequirement} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
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
