import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatDate } from '@/lib/utils'
import { useCurrentProject } from '@/lib/currentProject'
import {
  getTestCase,
  getTestCaseResults,
  TC_PRIORITY_BADGE_CLASS,
  TC_STATUS_BADGE_CLASS,
  EXECUTION_RESULT_BADGE_CLASS,
  type TestCaseDetail,
  type TestCaseExecutionHistoryItem,
} from '@/lib/testCases'
import { EditTestCaseDialog } from '@/components/EditTestCaseDialog'
import { DeleteTestCaseDialog } from '@/components/DeleteTestCaseDialog'
import { useToast } from '@/lib/toast'

export function TestCaseDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { project } = useCurrentProject()
  const [testCase, setTestCase] = useState<TestCaseDetail | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [history, setHistory] = useState<TestCaseExecutionHistoryItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const historyRequestIdRef = useRef(0)

  useEffect(() => {
    if (!id) return
    const numericId = Number(id)
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    setNotFound(false)
    getTestCase(numericId)
      .then((tc) => {
        if (requestIdRef.current !== requestId) return
        setTestCase(tc)
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
    if (!testCase) {
      setHistory(null)
      return
    }
    const requestId = ++historyRequestIdRef.current
    setHistory(null)
    getTestCaseResults(testCase.id)
      .then((rows) => {
        if (historyRequestIdRef.current !== requestId) return
        setHistory(rows)
      })
      .catch(() => {
        if (historyRequestIdRef.current !== requestId) return
        setHistory([])
      })
  }, [testCase])

  if (loading) {
    return <p className="px-4 text-sm text-muted-foreground">Đang tải...</p>
  }

  if (notFound) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-2 pt-4">
          <p className="text-sm text-muted-foreground">Không tìm thấy test case này.</p>
          <Link to="/testcases" className="text-sm text-primary underline-offset-4 hover:underline">
            ← Quay lại danh sách Test Cases
          </Link>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return <p className="px-4 text-sm text-destructive">{error}</p>
  }

  if (!testCase) return null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link to="/testcases" className="hover:underline">Test Cases</Link> {'>'} {testCase.code}
          </p>
          <h1 className="font-heading text-xl font-semibold">
            {testCase.code}: {testCase.title}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!project}
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="size-3.5" />
            Sửa
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-3.5" />
            Xóa
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Badge className={TC_PRIORITY_BADGE_CLASS[testCase.priority ?? ''] ?? ''}>
              {testCase.priority ?? '—'}
            </Badge>
            <Badge className={TC_STATUS_BADGE_CLASS[testCase.status] ?? ''}>{testCase.status}</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div>
              <h2 className="mb-1 text-sm font-medium">Preconditions</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {testCase.preconditions ?? '—'}
              </p>
            </div>
            <div>
              <h2 className="mb-1 text-sm font-medium">Steps</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {testCase.steps ?? '—'}
              </p>
            </div>
            <div>
              <h2 className="mb-1 text-sm font-medium">Expected Result</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {testCase.expected_result}
              </p>
            </div>

            <div>
              <h2 className="mb-2 text-sm font-medium">Run history</h2>
              {history === null && <p className="text-sm text-muted-foreground">Đang tải...</p>}
              {history !== null && history.length === 0 && (
                <p className="text-sm text-muted-foreground">Chưa có lần chạy nào.</p>
              )}
              {history !== null && history.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-0">Release</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead className="pr-0">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell className="pl-0">{row.release_version}</TableCell>
                        <TableCell>
                          <Badge className={EXECUTION_RESULT_BADGE_CLASS[row.result] ?? ''}>{row.result}</Badge>
                        </TableCell>
                        <TableCell className="pr-0">{formatDate(row.executed_at)}</TableCell>
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
                <dt className="text-muted-foreground">Code</dt>
                <dd>{testCase.code}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Priority</dt>
                <dd>{testCase.priority ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Status</dt>
                <dd>{testCase.status}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Requirement</dt>
                <dd>
                  {testCase.requirement ? (
                    <Link
                      to={`/requirements/${testCase.requirement.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {testCase.requirement.req_id}
                    </Link>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Created</dt>
                <dd>{formatDate(testCase.created_at)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      {project && (
        <EditTestCaseDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          projectId={project.id}
          testCase={testCase}
          onUpdated={(updated, requirement) => {
            setTestCase((tc) => (tc ? { ...tc, ...updated, requirement } : tc))
            toast.success(`Đã cập nhật test case ${updated.code}.`)
          }}
        />
      )}
      <DeleteTestCaseDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        testCase={{ id: testCase.id, code: testCase.code }}
        onDeleted={() => {
          const code = testCase.code
          navigate('/testcases')
          toast.success(`Đã xóa test case ${code}.`)
        }}
      />
    </div>
  )
}
