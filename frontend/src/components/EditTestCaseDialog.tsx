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
import {
  updateTestCase,
  type TestCase,
  type TestCaseDetail,
  type TestCasePriority,
  type TestCaseStatus,
} from '@/lib/testCases'
import { useToast } from '@/lib/toast'

type EditTestCaseDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  testCase: TestCaseDetail
  onUpdated: (testCase: TestCase, requirement: RequirementSummary) => void
}

const EDITABLE_STATUS_OPTIONS: TestCaseStatus[] = ['Draft', 'Active']

function initialStatus(status: string): TestCaseStatus | undefined {
  return status === 'Draft' || status === 'Active' ? status : undefined
}

export function EditTestCaseDialog({
  open,
  onOpenChange,
  projectId,
  testCase,
  onUpdated,
}: EditTestCaseDialogProps) {
  const toast = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [selectedRequirement, setSelectedRequirement] = useState<RequirementSummary | null>(
    testCase.requirement,
  )
  const [status, setStatus] = useState<TestCaseStatus | undefined>(
    initialStatus(testCase.status),
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedRequirement || !status) return
    const form = event.currentTarget
    const data = new FormData(form)
    const title = String(data.get('title') ?? '').trim()
    const expected_result = String(data.get('expected_result') ?? '').trim()
    const preconditions = String(data.get('preconditions') ?? '').trim()
    const steps = String(data.get('steps') ?? '').trim()
    const priority = String(data.get('priority') ?? 'Medium') as TestCasePriority

    setSubmitting(true)
    try {
      const updated = await updateTestCase(testCase.id, {
        title,
        expected_result,
        preconditions: preconditions || undefined,
        steps: steps || undefined,
        priority,
        status,
        requirement_id: selectedRequirement.id,
      })
      onOpenChange(false)
      onUpdated(updated, selectedRequirement)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
    } finally {
      setSubmitting(false)
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setSelectedRequirement(testCase.requirement)
      setStatus(initialStatus(testCase.status))
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Sửa Test Case</DialogTitle>
            <DialogDescription>Cập nhật thông tin test case {testCase.code}.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-tc-title">Tiêu đề</Label>
              <Input
                id="edit-tc-title"
                name="title"
                required
                defaultValue={testCase.title}
                placeholder="Nhập tiêu đề test case..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Requirement</Label>
              <RequirementCombobox
                projectId={projectId}
                value={selectedRequirement}
                onChange={setSelectedRequirement}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-tc-preconditions">Điều kiện tiên quyết</Label>
              <Textarea
                id="edit-tc-preconditions"
                name="preconditions"
                rows={2}
                defaultValue={testCase.preconditions ?? ''}
                placeholder="Người dùng đã có tài khoản..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-tc-steps">Các bước</Label>
              <Textarea
                id="edit-tc-steps"
                name="steps"
                rows={3}
                defaultValue={testCase.steps ?? ''}
                placeholder={'1. Mở trang đăng nhập\n2. Nhập email/mật khẩu\n3. Nhấn Đăng nhập'}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-tc-expected">Kết quả mong đợi</Label>
              <Textarea
                id="edit-tc-expected"
                name="expected_result"
                required
                rows={3}
                defaultValue={testCase.expected_result}
                placeholder="Người dùng được chuyển tới trang Dashboard"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-tc-priority">Độ ưu tiên</Label>
              <Select name="priority" defaultValue={testCase.priority ?? 'Medium'}>
                <SelectTrigger id="edit-tc-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-tc-status">Trạng thái</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as TestCaseStatus)}>
                <SelectTrigger id="edit-tc-status" className="w-full">
                  <SelectValue placeholder="Chọn trạng thái..." />
                </SelectTrigger>
                <SelectContent>
                  {EDITABLE_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={submitting || !selectedRequirement || !status}>
              {submitting ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
