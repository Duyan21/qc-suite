import { useEffect, useState, type FormEvent } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { updateDefect, type Defect, type DefectDetail, type DefectSeverity, type DefectStatus } from '@/lib/defects'
import { listMembers, type Member } from '@/lib/members'
import { useToast } from '@/lib/toast'

const NONE_VALUE = '__none__'

type EditDefectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  defect: DefectDetail
  onUpdated: (defect: Defect) => void
}

export function EditDefectDialog({ open, onOpenChange, defect, onUpdated }: EditDefectDialogProps) {
  const toast = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [members, setMembers] = useState<Member[]>([])

  useEffect(() => {
    if (!open) return
    listMembers(defect.project_id).then(setMembers).catch(() => setMembers([]))
  }, [open, defect.project_id])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const severity = String(data.get('severity') ?? defect.severity ?? 'Medium') as DefectSeverity
    const status = String(data.get('status') ?? defect.status) as DefectStatus
    const fixedInVersion = String(data.get('fixed_in_version') ?? '').trim()
    const assigneeIdRaw = String(data.get('assignee_user_id') ?? NONE_VALUE)

    setSubmitting(true)
    try {
      const updated = await updateDefect(defect.id, {
        severity,
        status,
        fixed_in_version: fixedInVersion || undefined,
        assignee_user_id: assigneeIdRaw === NONE_VALUE ? undefined : Number(assigneeIdRaw),
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
            <DialogTitle>Sửa Defect</DialogTitle>
            <DialogDescription>Cập nhật thông tin defect {defect.code}.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-defect-severity">Mức độ nghiêm trọng</Label>
              <Select name="severity" defaultValue={defect.severity ?? 'Medium'}>
                <SelectTrigger id="edit-defect-severity" className="w-full">
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
              <Label htmlFor="edit-defect-status">Trạng thái</Label>
              <Select name="status" defaultValue={defect.status}>
                <SelectTrigger id="edit-defect-status" className="w-full">
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
              <Label htmlFor="edit-defect-fixed-in-version">Fixed in version</Label>
              <Input
                id="edit-defect-fixed-in-version"
                name="fixed_in_version"
                defaultValue={defect.fixed_in_version ?? ''}
                placeholder="v2.1.0"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-defect-assignee">Assignee</Label>
              <Select
                name="assignee_user_id"
                defaultValue={defect.assignee_user_id ? String(defect.assignee_user_id) : NONE_VALUE}
              >
                <SelectTrigger id="edit-defect-assignee" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>— Không gán —</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={String(m.user_id)}>{m.full_name ?? m.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
