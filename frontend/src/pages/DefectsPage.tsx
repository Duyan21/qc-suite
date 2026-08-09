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
  listDefects,
  getDefectStats,
  DEFECT_SEVERITY_BADGE_CLASS,
  DEFECT_STATUS_BADGE_CLASS,
  type DefectListItem,
  type DefectListResponse,
  type DefectStats,
  type DefectSeverity,
  type DefectStatus,
} from '@/lib/defects'
import { NewDefectDialog } from '@/components/NewDefectDialog'
import { useToast } from '@/lib/toast'

const PAGE_SIZE = 20
const SEVERITY_OPTIONS: DefectSeverity[] = ['Critical', 'High', 'Medium', 'Low']
const STATUS_OPTIONS: DefectStatus[] = ['Open', 'Fixed', 'Closed', 'Wont-Fix']

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

export function DefectsPage() {
  const { project } = useCurrentProject()
  const toast = useToast()
  const [newOpen, setNewOpen] = useState(false)
  const [data, setData] = useState<DefectListResponse | null>(null)
  const [stats, setStats] = useState<DefectStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [severityFilter, setSeverityFilter] = useState<DefectSeverity | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<DefectStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const requestIdRef = useRef(0)
  const statsRequestIdRef = useRef(0)

  useEffect(() => {
    setPage(1)
  }, [project?.id, severityFilter, statusFilter, debouncedSearch])

  useEffect(() => {
    if (!project) {
      setData(null)
      return
    }
    load(project.id, page, severityFilter, statusFilter, debouncedSearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, page, severityFilter, statusFilter, debouncedSearch])

  useEffect(() => {
    loadStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  function load(
    projectId: number,
    page: number,
    severityFilter: DefectSeverity | 'all',
    statusFilter: DefectStatus | 'all',
    search: string,
  ) {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    listDefects({
      project_id: projectId,
      page,
      limit: PAGE_SIZE,
      severity: severityFilter === 'all' ? undefined : severityFilter,
      status: statusFilter === 'all' ? undefined : statusFilter,
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

  function loadStats() {
    if (!project) {
      setStats(null)
      return
    }
    const requestId = ++statsRequestIdRef.current
    getDefectStats(project.id)
      .then((result) => {
        if (statsRequestIdRef.current !== requestId) return
        setStats(result)
      })
      .catch(() => {
        if (statsRequestIdRef.current !== requestId) return
        setStats(null)
      })
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-xl font-semibold">Defects</h1>
          <p className="text-sm text-muted-foreground">
            {stats
              ? `${stats.total} defects · ${stats.by_status.Open ?? 0} Open · ${stats.by_severity.Critical ?? 0} Critical`
              : ' '}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setNewOpen(true)}
          disabled={!project}
          className="w-full sm:w-auto"
        >
          <Plus />
          Log Defect
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {STATUS_OPTIONS.map((s) => (
            <Card key={s} className="items-center gap-1 py-3 text-center">
              <p className="text-2xl font-semibold">{stats.by_status[s] ?? 0}</p>
              <p className="text-xs text-muted-foreground">{s}</p>
            </Card>
          ))}
          {SEVERITY_OPTIONS.map((s) => (
            <Card key={s} className="items-center gap-1 py-3 text-center">
              <p className="text-2xl font-semibold">{stats.by_severity[s] ?? 0}</p>
              <p className="text-xs text-muted-foreground">{s}</p>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            placeholder="Tìm defect..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-xs"
          />
          <Select
            value={severityFilter}
            onValueChange={(value) => setSeverityFilter(value as DefectSeverity | 'all')}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Severity: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Severity: All</SelectItem>
              {SEVERITY_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as DefectStatus | 'all')}
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
              onClick={() => load(project.id, page, severityFilter, statusFilter, debouncedSearch)}
            >
              Thử lại
            </Button>
          </div>
        )}
        {project && !loading && !error && data && data.items.length === 0 && (
          <p className="px-4 text-sm text-muted-foreground">Không tìm thấy defect nào.</p>
        )}
        {project && !loading && !error && data && data.items.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Linked TC</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="pr-4">Fixed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((d: DefectListItem) => (
                <TableRow key={d.id}>
                  <TableCell className="pl-4">
                    <Link to={`/defects/${d.id}`} className="text-primary underline-offset-4 hover:underline">
                      {d.code}
                    </Link>
                  </TableCell>
                  <TableCell>{d.title}</TableCell>
                  <TableCell>
                    <Badge className={DEFECT_SEVERITY_BADGE_CLASS[d.severity ?? ''] ?? ''}>
                      {d.severity ?? '—'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={DEFECT_STATUS_BADGE_CLASS[d.status] ?? ''}>{d.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {d.test_case ? (
                      <Link
                        to={`/testcases/${d.test_case.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {d.test_case.code}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(d.created_at)}</TableCell>
                  <TableCell className="pr-4">{d.fixed_in_version ?? '—'}</TableCell>
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
        <NewDefectDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          projectId={project.id}
          onCreated={(defect) => {
            load(project.id, page, severityFilter, statusFilter, debouncedSearch)
            loadStats()
            toast.success(`Đã tạo defect ${defect.code}.`, {
              href: `/defects/${defect.id}`,
              linkLabel: 'Xem defect →',
            })
          }}
        />
      )}
    </div>
  )
}
