import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useCurrentProject } from '@/lib/currentProject'
import { formatDate } from '@/lib/utils'
import {
  listTestCases,
  TC_PRIORITY_BADGE_CLASS,
  TC_STATUS_BADGE_CLASS,
  type TestCaseListItem,
  type TestCaseListResponse,
  type TestCaseStatus,
  type TestCasePriority,
} from '@/lib/testCases'
import { NewTestCaseDialog } from '@/components/NewTestCaseDialog'
import { useToast } from '@/lib/toast'

const PAGE_SIZE = 20
const STATUS_OPTIONS: TestCaseStatus[] = ['Draft', 'Active', 'Deprecated']
const PRIORITY_OPTIONS: TestCasePriority[] = ['High', 'Medium', 'Low']

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

export function TestCasesPage() {
  const { project } = useCurrentProject()
  const toast = useToast()
  const [newOpen, setNewOpen] = useState(false)
  const [data, setData] = useState<TestCaseListResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<TestCaseStatus | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<TestCasePriority | 'all'>('all')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const requestIdRef = useRef(0)

  useEffect(() => {
    setPage(1)
  }, [project?.id, statusFilter, priorityFilter, debouncedSearch])

  useEffect(() => {
    if (!project) {
      setData(null)
      return
    }
    load(project.id, page, statusFilter, priorityFilter, debouncedSearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, page, statusFilter, priorityFilter, debouncedSearch])

  function load(
    projectId: number,
    page: number,
    statusFilter: TestCaseStatus | 'all',
    priorityFilter: TestCasePriority | 'all',
    search: string,
  ) {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    listTestCases({
      project_id: projectId,
      page,
      limit: PAGE_SIZE,
      status: statusFilter === 'all' ? undefined : statusFilter,
      priority: priorityFilter === 'all' ? undefined : priorityFilter,
      search: search || undefined,
    })
      .then((result) => {
        if (requestIdRef.current !== requestId) return
        setData(result)
      })
      .catch((err) => {
        if (requestIdRef.current !== requestId) return
        setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return
        setLoading(false)
      })
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-xl font-semibold">Test Cases</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} test cases` : ' '}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setNewOpen(true)}
          disabled={!project}
          className="w-full sm:w-auto"
        >
          <Plus />
          New Test Case
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            placeholder="Tìm test case..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-xs"
          />
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as TestCaseStatus | 'all')}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Status: All</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={priorityFilter}
            onValueChange={(value) => setPriorityFilter(value as TestCasePriority | 'all')}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Priority: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Priority: All</SelectItem>
              {PRIORITY_OPTIONS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>

        {!project && (
          <p className="px-4 text-sm text-muted-foreground">Vui lòng chọn một dự án.</p>
        )}
        {project && loading && (
          <p className="px-4 text-sm text-muted-foreground">Đang tải...</p>
        )}
        {project && error && (
          <div className="flex items-center gap-3 px-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => load(project.id, page, statusFilter, priorityFilter, debouncedSearch)}
            >
              Thử lại
            </Button>
          </div>
        )}
        {project && !loading && !error && data && data.items.length === 0 && (
          <p className="px-4 text-sm text-muted-foreground">Không tìm thấy test case nào.</p>
        )}
        {project && !loading && !error && data && data.items.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Req Linked</TableHead>
                <TableHead className="pr-4">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((tc: TestCaseListItem) => (
                <TableRow key={tc.id}>
                  <TableCell className="pl-4">
                    <Link to={`/testcases/${tc.id}`} className="text-primary underline-offset-4 hover:underline">
                      {tc.code}
                    </Link>
                  </TableCell>
                  <TableCell>{tc.title}</TableCell>
                  <TableCell>
                    <Badge className={TC_PRIORITY_BADGE_CLASS[tc.priority ?? ''] ?? ''}>
                      {tc.priority ?? '—'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={TC_STATUS_BADGE_CLASS[tc.status] ?? ''}>{tc.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {tc.requirement ? (
                      <Link
                        to={`/requirements/${tc.requirement.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {tc.requirement.req_id}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="pr-4 text-muted-foreground">{formatDate(tc.updated_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {project && !loading && !error && data && data.total > 0 && (
          <div className="flex items-center justify-between px-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Trang {data.page} / {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Trước
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Sau →
              </Button>
            </div>
          </div>
        )}
      </Card>

      {project && (
        <NewTestCaseDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          projectId={project.id}
          onCreated={(tc) => {
            load(project.id, page, statusFilter, priorityFilter, debouncedSearch)
            toast.success(`Đã tạo test case ${tc.code}.`, {
              href: `/testcases/${tc.id}`,
              linkLabel: 'Xem test case →',
            })
          }}
        />
      )}
    </div>
  )
}
