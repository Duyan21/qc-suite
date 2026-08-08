import { useEffect, useMemo, useRef, useState } from 'react'
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
  listRequirements,
  REQUIREMENT_STATUS_BADGE_CLASS,
  type Requirement,
  type RequirementListResponse,
  type RequirementStatus,
} from '@/lib/requirements'
import { getTraceability, type TraceabilityResponse } from '@/lib/traceability'
import { NewRequirementDialog } from '@/components/NewRequirementDialog'
import { useToast } from '@/lib/toast'

const PAGE_SIZE = 20
const STATUS_OPTIONS: RequirementStatus[] = ['Draft', 'Active', 'Deprecated']

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

export function RequirementsPage() {
  const { project } = useCurrentProject()
  const toast = useToast()
  const [newOpen, setNewOpen] = useState(false)
  const [data, setData] = useState<RequirementListResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<RequirementStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [traceability, setTraceability] = useState<TraceabilityResponse | null>(null)
  const listRequestIdRef = useRef(0)
  const traceabilityRequestIdRef = useRef(0)

  const tcCountByReqId = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of traceability?.items ?? []) {
      map.set(item.req_id, item.test_cases.length)
    }
    return map
  }, [traceability?.items])

  useEffect(() => {
    setPage(1)
  }, [project?.id, statusFilter, debouncedSearch])

  useEffect(() => {
    if (!project) {
      setData(null)
      return
    }
    load(project.id, page, statusFilter, debouncedSearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, page, statusFilter, debouncedSearch])

  function load(projectId: number, page: number, statusFilter: RequirementStatus | 'all', search: string) {
    const requestId = ++listRequestIdRef.current
    setLoading(true)
    setError(null)
    listRequirements(projectId, {
      page,
      limit: PAGE_SIZE,
      status: statusFilter === 'all' ? undefined : statusFilter,
      search: search || undefined,
    })
      .then((result) => {
        if (listRequestIdRef.current !== requestId) return
        setData(result)
      })
      .catch((err) => {
        if (listRequestIdRef.current !== requestId) return
        setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
      })
      .finally(() => {
        if (listRequestIdRef.current !== requestId) return
        setLoading(false)
      })
  }

  useEffect(() => {
    if (!project) {
      setTraceability(null)
      return
    }
    const requestId = ++traceabilityRequestIdRef.current
    getTraceability(project.id)
      .then((result) => {
        if (traceabilityRequestIdRef.current !== requestId) return
        setTraceability(result)
      })
      .catch(() => {
        if (traceabilityRequestIdRef.current !== requestId) return
        setTraceability(null)
      })
  }, [project?.id])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-xl font-semibold">Requirements</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} requirements` : ' '}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setNewOpen(true)}
          disabled={!project}
          className="w-full sm:w-auto"
        >
          <Plus />
          New Requirement
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            placeholder="Tìm kiếm requirement..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-xs"
          />
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as RequirementStatus | 'all')}
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
              onClick={() => load(project.id, page, statusFilter, debouncedSearch)}
            >
              Thử lại
            </Button>
          </div>
        )}
        {project && !loading && !error && data && data.items.length === 0 && (
          <p className="px-4 text-sm text-muted-foreground">Không tìm thấy requirement nào.</p>
        )}
        {project && !loading && !error && data && data.items.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Linked TC</TableHead>
                <TableHead className="pr-4">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((req: Requirement) => (
                <TableRow key={req.id}>
                  <TableCell className="pl-4">
                    <Link to={`/requirements/${req.id}`} className="text-primary underline-offset-4 hover:underline">
                      {req.req_id}
                    </Link>
                  </TableCell>
                  <TableCell>{req.title}</TableCell>
                  <TableCell>
                    <Badge className={REQUIREMENT_STATUS_BADGE_CLASS[req.status] ?? ''}>{req.status}</Badge>
                  </TableCell>
                  <TableCell>v{req.version}</TableCell>
                  <TableCell>{tcCountByReqId.get(req.req_id) ?? '—'}</TableCell>
                  <TableCell className="pr-4 text-muted-foreground">{formatDate(req.created_at)}</TableCell>
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
        <NewRequirementDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          projectId={project.id}
          onCreated={(req) => {
            load(project.id, page, statusFilter, debouncedSearch)
            toast.success(`Đã tạo requirement ${req.req_id}.`, {
              href: `/requirements/${req.id}`,
              linkLabel: 'Xem requirement →',
            })
          }}
        />
      )}
    </div>
  )
}
