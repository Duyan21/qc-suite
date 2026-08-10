import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useCurrentProject } from '@/lib/currentProject'
import { formatDate } from '@/lib/utils'
import {
  listDefects,
  DEFECT_SEVERITY_BADGE_CLASS,
  DEFECT_STATUS_BADGE_CLASS,
  type DefectListItem,
  type DefectSeverity,
  type DefectStatus,
} from '@/lib/defects'
import { NewDefectDialog } from '@/components/NewDefectDialog'
import { useToast } from '@/lib/toast'

const PAGE_SIZE = 20
const FETCH_LIMIT = 200
const SEVERITY_OPTIONS: DefectSeverity[] = ['Critical', 'High', 'Medium', 'Low']
const STATUS_OPTIONS: DefectStatus[] = ['Open', 'Fixed', 'Closed', 'Wont-Fix']

const SEVERITY_RANK: Record<DefectSeverity, number> = {
  Critical: 3,
  High: 2,
  Medium: 1,
  Low: 0,
}

function matchesDefectFilters(
  d: DefectListItem,
  opts: { search: string; severities: Set<DefectSeverity>; statuses: Set<DefectStatus> },
): boolean {
  const { search, severities, statuses } = opts
  if (search) {
    const q = search.toLowerCase()
    const haystack = `${d.code} ${d.title}`.toLowerCase()
    if (!haystack.includes(q)) return false
  }
  if (severities.size > 0) {
    if (!d.severity || !severities.has(d.severity as DefectSeverity)) return false
  }
  if (statuses.size > 0) {
    if (!statuses.has(d.status as DefectStatus)) return false
  }
  return true
}

function compareDefects(a: DefectListItem, b: DefectListItem): number {
  const rankA = a.severity ? SEVERITY_RANK[a.severity as DefectSeverity] ?? -1 : -1
  const rankB = b.severity ? SEVERITY_RANK[b.severity as DefectSeverity] ?? -1 : -1
  if (rankA !== rankB) return rankB - rankA
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}

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
  const [allDefects, setAllDefects] = useState<DefectListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [selectedSeverities, setSelectedSeverities] = useState<Set<DefectSeverity>>(new Set())
  const [selectedStatuses, setSelectedStatuses] = useState<Set<DefectStatus>>(new Set())
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const requestIdRef = useRef(0)

  useEffect(() => {
    setPage(1)
  }, [project?.id, debouncedSearch, selectedSeverities, selectedStatuses])

  useEffect(() => {
    if (!project) {
      setAllDefects([])
      return
    }
    load(project.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  function load(projectId: number) {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    listDefects({ project_id: projectId, limit: FETCH_LIMIT })
      .then((result) => {
        if (requestIdRef.current !== requestId) return
        setAllDefects(result.items)
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

  const filteredSorted = useMemo(() => {
    return allDefects
      .filter((d) =>
        matchesDefectFilters(d, {
          search: debouncedSearch,
          severities: selectedSeverities,
          statuses: selectedStatuses,
        }),
      )
      .sort(compareDefects)
  }, [allDefects, debouncedSearch, selectedSeverities, selectedStatuses])

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE))
  const pageItems = filteredSorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const statusCounts = useMemo(() => {
    const counts: Record<DefectStatus, number> = { Open: 0, Fixed: 0, Closed: 0, 'Wont-Fix': 0 }
    for (const d of allDefects) {
      if (d.status in counts) counts[d.status as DefectStatus]++
    }
    return counts
  }, [allDefects])

  const openCount = statusCounts.Open
  const criticalCount = allDefects.filter((d) => d.severity === 'Critical').length
  const activeFilterCount = selectedSeverities.size + selectedStatuses.size

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
        <div className="flex flex-col gap-3 px-4 pt-4">
          <Input
            placeholder="Tìm theo ID, tiêu đề, test case..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-sm"
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={selectedStatuses.size === 0 ? 'default' : 'outline'}
              onClick={() => setSelectedStatuses(new Set())}
            >
              All {allDefects.length}
            </Button>
            {STATUS_OPTIONS.map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={selectedStatuses.has(s) ? 'default' : 'outline'}
                onClick={() =>
                  setSelectedStatuses((prev) => {
                    const next = new Set(prev)
                    if (next.has(s)) next.delete(s)
                    else next.add(s)
                    return next
                  })
                }
              >
                {s} {statusCounts[s]}
              </Button>
            ))}
            {activeFilterCount > 0 && (
              <Button
                type="button"
                size="sm"
                variant="link"
                className="ml-auto"
                onClick={() => {
                  setSelectedStatuses(new Set())
                  setSelectedSeverities(new Set())
                }}
              >
                Xóa bộ lọc ({activeFilterCount})
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase text-muted-foreground">Severity</span>
            {SEVERITY_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() =>
                  setSelectedSeverities((prev) => {
                    const next = new Set(prev)
                    if (next.has(s)) next.delete(s)
                    else next.add(s)
                    return next
                  })
                }
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                  selectedSeverities.has(s)
                    ? DEFECT_SEVERITY_BADGE_CLASS[s]
                    : 'border-input text-muted-foreground'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {s}
              </button>
            ))}
          </div>
        </div>

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
