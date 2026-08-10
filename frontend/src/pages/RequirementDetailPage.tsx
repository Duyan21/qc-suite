import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { History as HistoryIcon, Pencil, Plus, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatDate } from '@/lib/utils'
import {
  getRequirement,
  getRequirementHistory,
  REQUIREMENT_STATUS_BADGE_CLASS,
  type Requirement,
} from '@/lib/requirements'
import { getTraceability, type TraceabilityStatus } from '@/lib/traceability'
import { listDefects } from '@/lib/defects'
import { listTestCases } from '@/lib/testCases'
import { NewTestCaseDialog } from '@/components/NewTestCaseDialog'
import { EditRequirementDialog } from '@/components/EditRequirementDialog'
import { DeleteRequirementDialog } from '@/components/DeleteRequirementDialog'
import { useToast } from '@/lib/toast'

type LinkedTestCase = { id: number; code: string; title: string; status: TraceabilityStatus | null }

export function RequirementDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [newTcOpen, setNewTcOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [requirement, setRequirement] = useState<Requirement | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkedTestCases, setLinkedTestCases] = useState<LinkedTestCase[] | null>(null)
  const [linkedTestCasesError, setLinkedTestCasesError] = useState(false)
  const [defectCount, setDefectCount] = useState<number | null>(null)
  const [history, setHistory] = useState<Requirement[] | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(false)
  const requestIdRef = useRef(0)
  const defectRequestIdRef = useRef(0)
  const linkedTcRequestIdRef = useRef(0)

  useEffect(() => {
    if (!id) return
    const numericId = Number(id)
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    setNotFound(false)
    getRequirement(numericId)
      .then((req) => {
        if (requestIdRef.current !== requestId) return
        setRequirement(req)
      })
      .catch((err) => {
        if (requestIdRef.current !== requestId) return
        if (err instanceof Error && err.message.includes('not found')) {
          setNotFound(true)
        } else {
          setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
        }
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return
        setLoading(false)
      })
  }, [id])

  useEffect(() => {
    if (!requirement) {
      setDefectCount(null)
      return
    }
    const requestId = ++defectRequestIdRef.current
    setDefectCount(null)
    listDefects({ requirement_id: requirement.id, limit: 1 })
      .then((result) => {
        if (defectRequestIdRef.current !== requestId) return
        setDefectCount(result.total)
      })
      .catch(() => {
        if (defectRequestIdRef.current !== requestId) return
        setDefectCount(null)
      })
  }, [requirement])

  function reloadLinkedTestCases(req: Requirement) {
    const requestId = ++linkedTcRequestIdRef.current
    setLinkedTestCases(null)
    setLinkedTestCasesError(false)

    const load = req.is_current
      ? getTraceability(req.project_id).then((result) => {
          const match = result.items.find((item) => item.id === req.id)
          return (match?.test_cases ?? []).map((tc) => ({
            id: tc.id,
            code: tc.code,
            title: tc.title,
            status: tc.status,
          }))
        })
      : listTestCases({ requirement_id: req.id, limit: 200 }).then((result) =>
          result.items.map((tc) => ({ id: tc.id, code: tc.code, title: tc.title, status: null })),
        )

    load
      .then((items) => {
        if (linkedTcRequestIdRef.current !== requestId) return
        setLinkedTestCases(items)
      })
      .catch(() => {
        if (linkedTcRequestIdRef.current !== requestId) return
        setLinkedTestCasesError(true)
      })
  }

  useEffect(() => {
    if (!requirement) {
      setLinkedTestCases(null)
      setLinkedTestCasesError(false)
      return
    }
    reloadLinkedTestCases(requirement)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirement])

  function openHistory() {
    if (!requirement) return
    setHistoryOpen(true)
    setHistoryLoading(true)
    setHistoryError(false)
    getRequirementHistory(requirement.req_id)
      .then((versions) => setHistory(versions))
      .catch(() => setHistoryError(true))
      .finally(() => setHistoryLoading(false))
  }

  if (loading) {
    return <p className="px-4 text-sm text-muted-foreground">Đang tải...</p>
  }

  if (notFound) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-2 pt-4">
          <p className="text-sm text-muted-foreground">Không tìm thấy requirement này.</p>
          <Link to="/requirements" className="text-sm text-primary underline-offset-4 hover:underline">
            ← Quay lại danh sách Requirements
          </Link>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return <p className="px-4 text-sm text-destructive">{error}</p>
  }

  if (!requirement) return null

  const passedCount = linkedTestCases?.filter((tc) => tc.status === 'covered').length ?? 0
  const totalCount = linkedTestCases?.length ?? 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link to="/requirements" className="hover:underline">Requirements</Link> {'>'} {requirement.req_id}
          </p>
          <h1 className="font-heading text-xl font-semibold">
            {requirement.req_id}: {requirement.title}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!requirement.is_current}
            title={requirement.is_current ? undefined : 'Chỉ có thể sửa phiên bản hiện tại'}
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="size-3.5" />
            Sửa
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!requirement.is_current || requirement.status === 'Deprecated'}
            title={
              !requirement.is_current
                ? 'Chỉ có thể xóa phiên bản hiện tại'
                : requirement.status === 'Deprecated'
                  ? 'Requirement này đã bị xóa'
                  : undefined
            }
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-3.5" />
            Xóa
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={openHistory}>
            <HistoryIcon className="size-3.5" />
            History
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!requirement.is_current}
            title={requirement.is_current ? undefined : 'Chỉ có thể thêm test case cho phiên bản hiện tại'}
            onClick={() => setNewTcOpen(true)}
          >
            <Plus className="size-3.5" />
            New Test Case
          </Button>
        </div>
      </div>

      {!requirement.is_current && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
          Đây là phiên bản cũ (v{requirement.version}).{' '}
          <button type="button" onClick={openHistory} className="underline underline-offset-4">
            Xem lịch sử phiên bản
          </button>{' '}
          để tới phiên bản hiện tại.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Badge className={REQUIREMENT_STATUS_BADGE_CLASS[requirement.status] ?? ''}>
              {requirement.status}
            </Badge>
            <Badge variant="outline">v{requirement.version}</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div>
              <h2 className="mb-1 text-sm font-medium">Mô tả</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{requirement.description}</p>
            </div>

            <div>
              <h2 className="mb-2 text-sm font-medium">
                Test Cases liên kết ({passedCount}/{totalCount})
              </h2>
              {linkedTestCasesError && (
                <p className="text-sm text-destructive">Không tải được danh sách test case liên kết.</p>
              )}
              {!linkedTestCasesError && linkedTestCases === null && (
                <p className="text-sm text-muted-foreground">Đang tải...</p>
              )}
              {!linkedTestCasesError && linkedTestCases !== null && linkedTestCases.length === 0 && (
                <p className="text-sm text-muted-foreground">Chưa có test case nào được liên kết.</p>
              )}
              {!linkedTestCasesError && linkedTestCases !== null && linkedTestCases.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-0">ID</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead className="pr-0 text-right">Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linkedTestCases.map((tc) => (
                      <TableRow key={tc.id}>
                        <TableCell className="pl-0">
                          <Link to={`/testcases/${tc.id}`} className="text-primary underline-offset-4 hover:underline">
                            {tc.code}
                          </Link>
                        </TableCell>
                        <TableCell>{tc.title}</TableCell>
                        <TableCell className="pr-0 text-right">
                          {tc.status === 'covered' && (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                              Pass
                            </Badge>
                          )}
                          {tc.status === 'failed' && (
                            <Badge className="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400">
                              Fail
                            </Badge>
                          )}
                          {tc.status === 'partial' && <Badge variant="outline">Chưa chạy</Badge>}
                          {tc.status === null && <Badge variant="outline">—</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Thông tin</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">ID</dt>
                <dd>{requirement.req_id}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Status</dt>
                <dd>{requirement.status}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Version</dt>
                <dd>v{requirement.version}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Created</dt>
                <dd>{formatDate(requirement.created_at)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Linked TC</dt>
                <dd>{linkedTestCases === null ? '—' : linkedTestCases.length}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Linked Defects</dt>
                <dd>{defectCount === null ? '—' : defectCount}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Lịch sử thay đổi — {requirement.req_id}</DialogTitle>
            <DialogDescription>Tất cả các phiên bản của requirement này.</DialogDescription>
          </DialogHeader>
          {historyLoading && <p className="text-sm text-muted-foreground">Đang tải...</p>}
          {!historyLoading && historyError && (
            <p className="text-sm text-destructive">Không tải được lịch sử phiên bản.</p>
          )}
          {!historyLoading && !historyError && history && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-0">Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Change note</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead className="pr-0">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="pl-0">
                      v{v.version}
                      {v.is_current ? ' (current)' : ''}
                    </TableCell>
                    <TableCell>{v.status}</TableCell>
                    <TableCell>{v.change_note ?? '—'}</TableCell>
                    <TableCell>{v.changed_by ?? '—'}</TableCell>
                    <TableCell className="pr-0">{formatDate(v.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      <NewTestCaseDialog
        open={newTcOpen}
        onOpenChange={setNewTcOpen}
        projectId={requirement.project_id}
        lockedRequirement={{
          id: requirement.id,
          req_id: requirement.req_id,
          version: requirement.version,
          title: requirement.title,
          status: requirement.status,
        }}
        onCreated={(tc) => {
          reloadLinkedTestCases(requirement)
          toast.success(`Đã tạo test case ${tc.code}.`, {
            href: `/testcases/${tc.id}`,
            linkLabel: 'Xem test case →',
          })
        }}
      />

      <EditRequirementDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        requirement={requirement}
        onUpdated={(updated) => {
          toast.success(`Đã cập nhật requirement ${updated.req_id}.`)
          navigate(`/requirements/${updated.id}`, { replace: true })
        }}
      />

      <DeleteRequirementDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        requirement={{ id: requirement.id, req_id: requirement.req_id }}
        onDeleted={(updated) => {
          toast.success(`Đã xóa requirement ${updated.req_id}.`)
          navigate('/requirements')
        }}
      />
    </div>
  )
}
