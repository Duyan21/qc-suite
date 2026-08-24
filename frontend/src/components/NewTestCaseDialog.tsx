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
import type { RequirementSummary } from '@/lib/requirements'
import { createTestCase, type TestCase, type TestCasePriority } from '@/lib/testCases'

type NewTestCaseDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  lockedRequirement?: RequirementSummary | null
  initialTitle?: string
  initialSteps?: string
  initialExpectedResult?: string
  onCreated: (testCase: TestCase) => void
}

export function NewTestCaseDialog({
  open,
  onOpenChange,
  projectId,
  lockedRequirement,
  initialTitle,
  initialSteps,
  initialExpectedResult,
  onCreated,
}: NewTestCaseDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedRequirement, setSelectedRequirement] = useState<RequirementSummary | null>(null)

  const requirement = lockedRequirement ?? selectedRequirement

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!requirement) return
    const form = event.currentTarget
    const data = new FormData(form)
    const title = String(data.get('title') ?? '').trim()
    const expected_result = String(data.get('expected_result') ?? '').trim()
    const preconditions = String(data.get('preconditions') ?? '').trim()
    const steps = String(data.get('steps') ?? '').trim()
    const priority = String(data.get('priority') ?? 'Medium') as TestCasePriority

    setSubmitting(true)
    setError(null)
    try {
      const testCase = await createTestCase({
        title,
        expected_result,
        preconditions: preconditions || undefined,
        steps: steps || undefined,
        priority,
        requirement_id: requirement.id,
      })
      form.reset()
      setSelectedRequirement(null)
      onOpenChange(false)
      onCreated(testCase)
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
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Test Case mới</DialogTitle>
            <DialogDescription>
              Tạo một test case mới{lockedRequirement ? ` cho ${lockedRequirement.req_id}` : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-tc-title">Tiêu đề</Label>
              <Input
                id="new-tc-title"
                name="title"
                required
                defaultValue={initialTitle}
                placeholder="Nhập tiêu đề test case..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Requirement</Label>
              {lockedRequirement ? (
                <p className="text-sm text-muted-foreground">
                  {lockedRequirement.req_id} — {lockedRequirement.title}
                </p>
              ) : (
                <RequirementCombobox
                  projectId={projectId}
                  value={selectedRequirement}
                  onChange={setSelectedRequirement}
                />
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-tc-preconditions">Điều kiện tiên quyết</Label>
              <Textarea
                id="new-tc-preconditions"
                name="preconditions"
                rows={2}
                placeholder="Người dùng đã có tài khoản..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-tc-steps">Các bước</Label>
              <Textarea
                id="new-tc-steps"
                name="steps"
                rows={3}
                defaultValue={initialSteps}
                placeholder={'1. Mở trang đăng nhập\n2. Nhập email/mật khẩu\n3. Nhấn Đăng nhập'}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-tc-expected">Kết quả mong đợi</Label>
              <Textarea
                id="new-tc-expected"
                name="expected_result"
                required
                rows={3}
                defaultValue={initialExpectedResult}
                placeholder="Người dùng được chuyển tới trang Dashboard"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-tc-priority">Độ ưu tiên</Label>
              <Select name="priority" defaultValue="Medium">
                <SelectTrigger id="new-tc-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={submitting || !requirement}>
              {submitting ? 'Đang tạo...' : 'Tạo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
