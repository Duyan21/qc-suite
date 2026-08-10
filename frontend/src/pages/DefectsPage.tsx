import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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

const SEVERITY_DOT_CLASS: Record<DefectSeverity, string> = {
  Critical: 'bg-red-500',
  High: 'bg-amber-500',
  Medium: 'bg-amber-500',
  Low: 'bg-muted-foreground',
}

function matchesDefectFilters(
  d: DefectListItem,
  opts: { search: string; severities: Set<DefectSeverity>; status: DefectStatus | 'all' },
): boolean {
  const { search, severities, status } = opts
  if (search) {
    const q = search.toLowerCase()
    const haystack = `${d.code} ${d.title}`.toLowerCase()
    if (!haystack.includes(q)) return false
  }
  if (severities.size > 0) {
    if (!d.severity || !severities.has(d.severity as DefectSeverity)) return false
  }
  if (status !== 'all' && d.status !== status) return false
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
  const navigate = useNavigate()
  const [newOpen, setNewOpen] = useState(false)
  const [allDefects, setAllDefects] = useState<DefectListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [selectedSeverities, setSelectedSeverities] = useState<Set<DefectSeverity>>(new Set())
  const [selectedStatus, setSelectedStatus] = useState<DefectStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const requestIdRef = useRef(0)

  useEffect(() => {
    setPage(1)
  }, [project?.id, debouncedSearch, selectedSeverities, selectedStatus])

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
          status: selectedStatus,
        }),
      )
      .sort(compareDefects)
  }, [allDefects, debouncedSearch, selectedSeverities, selectedStatus])

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
  const activeFilterCount = selectedSeverities.size + (selectedStatus === 'all' ? 0 : 1)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-xl font-semibold">Defects</h1>
          <p className="text-sm text-muted-foreground">
            {project ? `${allDefects.length} defects · ${openCount} open · ${criticalCount} critical` : ' '}
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

      <Card>
        <div className="flex flex-col gap-3 px-4 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Tìm theo ID, tiêu đề, test case..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:max-w-sm"
            />
            <button
              type="button"
              onClick={() => setSelectedStatus('all')}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                selectedStatus === 'all'
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-input text-muted-foreground'
              }`}
            >
              All {allDefects.length}
            </button>
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSelectedStatus(s)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  selectedStatus === s
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-input text-muted-foreground'
                }`}
              >
                {s} {statusCounts[s]}
              </button>
            ))}
            {activeFilterCount > 0 && (
              <Button
                type="button"
                size="sm"
                variant="link"
                className="ml-auto"
                onClick={() => {
                  setSelectedStatus('all')
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
                <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT_CLASS[s]}`} />
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
            <Button size="sm" variant="outline" onClick={() => load(project.id)}>
              Thử lại
            </Button>
          </div>
        )}
        {project && !loading && !error && (
          <p className="flex items-center justify-between px-4 text-xs text-muted-foreground">
            <span>{filteredSorted.length} kết quả</span>
            <span>Sắp xếp: severity → ngày tạo</span>
          </p>
        )}
        {project && !loading && !error && pageItems.length === 0 && (
          <p className="px-4 text-sm text-muted-foreground">Không tìm thấy defect nào.</p>
        )}
        {project && !loading && !error && pageItems.length > 0 && (
          <div className="flex flex-col gap-2 px-4">
            {pageItems.map((d: DefectListItem) => (
              <Card
                key={d.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/defects/${d.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    navigate(`/defects/${d.id}`)
                  }
                }}
                className={`flex-row gap-3 border-l-4 p-4 cursor-pointer transition-colors hover:bg-muted/50 ${
                  d.severity === 'Critical'
                    ? 'border-l-red-500'
                    : d.severity === 'High' || d.severity === 'Medium'
                      ? 'border-l-amber-500'
                      : 'border-l-muted-foreground/30'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/defects/${d.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {d.code}
                    </Link>
                    <Badge className={DEFECT_SEVERITY_BADGE_CLASS[d.severity ?? ''] ?? ''}>
                      {d.severity ?? '—'}
                    </Badge>
                    <Badge className={DEFECT_STATUS_BADGE_CLASS[d.status] ?? ''}>{d.status}</Badge>
                  </div>
                  <p className="mt-1 font-semibold">{d.title}</p>
                  {d.description && (
                    <p className="truncate text-sm text-muted-foreground">{d.description}</p>
                  )}
                </div>
                <div className="grid shrink-0 grid-cols-3 gap-4 text-right text-xs">
                  <div>
                    <p className="text-muted-foreground">Linked TC</p>
                    {d.test_case ? (
                      <Link
                        to={`/testcases/${d.test_case.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {d.test_case.code}
                      </Link>
                    ) : (
                      <p>—</p>
                    )}
                  </div>
                  <div>
                    <p className="text-muted-foreground">Created</p>
                    <p>{formatDate(d.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Fixed</p>
                    <p>{d.fixed_in_version ?? '—'}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {project && !loading && !error && filteredSorted.length > 0 && (
          <div className="flex items-center justify-between px-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Trang {page} / {totalPages}
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
            load(project.id)
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
