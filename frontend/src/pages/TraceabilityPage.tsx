// frontend/src/pages/TraceabilityPage.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useCurrentProject } from '@/lib/currentProject'
import { getTraceability, type TraceabilityResponse } from '@/lib/traceability'
import { StatCards } from '@/components/traceability/StatCards'
import { FilterBar } from '@/components/traceability/FilterBar'
import { ListView } from '@/components/traceability/ListView'
import { MatrixView } from '@/components/traceability/MatrixView'
import { deriveRequirements, computeTraceabilityStats, type DerivedRequirement } from '@/components/traceability/deriveTraceability'
import { DEFAULT_FILTERS, filterRequirements, type TraceabilityFilters } from '@/components/traceability/traceabilityFilters'

type ViewMode = 'list' | 'matrix'

function deriveColumnsForExport(items: DerivedRequirement[]) {
  return items.flatMap((req) => req.test_cases.map((tc) => ({ id: tc.id, code: tc.code })))
}

function exportCsv(items: DerivedRequirement[]) {
  const columns = deriveColumnsForExport(items)
  const header = ['Requirement', ...columns.map((c) => c.code)]
  const rows = items.map((req) => {
    const statusByTcId = new Map(req.test_cases.map((tc) => [tc.id, tc.status]))
    return [req.req_id, ...columns.map((col) => statusByTcId.get(col.id) ?? '')]
  })
  const csv = [header, ...rows].map((row) => row.join(',')).join('\n')

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'traceability.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function TraceabilityPage() {
  const { project } = useCurrentProject()
  const [data, setData] = useState<TraceabilityResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('list')
  const [filters, setFilters] = useState<TraceabilityFilters>(DEFAULT_FILTERS)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!project) {
      setData(null)
      return
    }
    load(project.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  function load(projectId: number) {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    getTraceability(projectId)
      .then((result) => {
        if (requestIdRef.current !== requestId) return
        setData(result)
        setFilters(DEFAULT_FILTERS)
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

  // `derived`/`filtered`/`stats` always default to an empty array/zeroed
  // stats rather than staying null — every render check below keys off their
  // `.length`, not `data.items.length`, so TypeScript can't complain about a
  // possibly-null `data` (a bare `hasData` boolean would not narrow `data`).
  const derived = useMemo<DerivedRequirement[]>(
    () => (data ? deriveRequirements(data.items) : []),
    [data],
  )
  const stats = useMemo(() => computeTraceabilityStats(derived), [derived])
  const filtered = useMemo(
    () => filterRequirements(derived, filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [derived, filters.search, filters.module, filters.coverage],
  )

  const hasData = !!project && !loading && !error && !!data
  const hasRequirements = hasData && derived.length > 0
  const isEmpty = hasData && derived.length === 0

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Traceability Matrix</CardTitle>
          {hasRequirements && (
            <p className="text-sm text-muted-foreground">
              {stats.totalRequirementCount} requirements · {stats.totalTestCaseCount} test cases ·{' '}
              <span className="text-destructive">{stats.coverageGapCount} chưa được cover</span>
            </p>
          )}
        </div>
        {hasRequirements && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border">
              <Button
                type="button"
                variant={view === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                className="rounded-none border-0"
                onClick={() => setView('list')}
              >
                Danh sách
              </Button>
              <Button
                type="button"
                variant={view === 'matrix' ? 'secondary' : 'ghost'}
                size="sm"
                className="rounded-none border-0"
                onClick={() => setView('matrix')}
              >
                Ma trận
              </Button>
            </div>
            <Button size="sm" onClick={() => exportCsv(filtered)}>
              Xuất CSV
            </Button>
          </div>
        )}
      </CardHeader>

      {!project && <p className="px-4 text-sm text-muted-foreground">Vui lòng chọn một dự án.</p>}
      {project && loading && <p className="px-4 text-sm text-muted-foreground">Đang tải...</p>}
      {project && error && (
        <div className="flex items-center gap-3 px-4">
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={() => load(project.id)}>
            Thử lại
          </Button>
        </div>
      )}
      {isEmpty && <p className="px-4 text-sm text-muted-foreground">Chưa có yêu cầu nào.</p>}

      {hasRequirements && (
        <>
          <div className="px-4">
            <StatCards stats={stats} />
          </div>
          <div className="px-4">
            <FilterBar filters={filters} onFiltersChange={setFilters} />
          </div>
          {view === 'list' ? (
            <ListView requirements={filtered} runStatusChips={filters.runStatusChips} />
          ) : (
            <MatrixView
              requirements={filtered}
              runStatusChips={filters.runStatusChips}
              moduleFilterActive={filters.module !== 'all'}
            />
          )}
        </>
      )}
    </Card>
  )
}
