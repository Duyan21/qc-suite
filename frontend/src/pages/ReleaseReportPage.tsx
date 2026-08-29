import { useEffect, useMemo, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCurrentProject } from '@/lib/currentProject'
import { formatDate } from '@/lib/utils'
import { listReleases, getBurndown, type Release, type BurndownPoint } from '@/lib/releases'
import {
  listDefects,
  compareDefectsBySeverity,
  type DefectListItem,
  type DefectSeverity,
  type DefectStatus,
} from '@/lib/defects'
import { StatTile } from '@/components/report/StatTile'
import { ExecutionStatusBar } from '@/components/report/ExecutionStatusBar'
import { BurndownChart } from '@/components/report/BurndownChart'
import { DefectSeverityChart } from '@/components/report/DefectSeverityChart'
import { DefectStatusChart } from '@/components/report/DefectStatusChart'
import { DefectList } from '@/components/report/DefectList'

const DEFECT_FETCH_LIMIT = 200

type ChartFilter =
  | { type: 'severity'; value: DefectSeverity }
  | { type: 'status'; value: DefectStatus }
  | null

function pickDefaultRelease(releases: Release[]): Release | null {
  if (releases.length === 0) return null
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = releases
    .filter((r) => r.target_date && r.target_date >= today)
    .sort((a, b) => (a.target_date! < b.target_date! ? -1 : 1))
  if (upcoming.length > 0) return upcoming[0]
  return releases[0] // listReleases orders by created_at desc
}

export function ReleaseReportPage() {
  const { project } = useCurrentProject()
  const [releases, setReleases] = useState<Release[] | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [burndown, setBurndown] = useState<BurndownPoint[]>([])
  const [defects, setDefects] = useState<DefectListItem[]>([])
  const [filter, setFilter] = useState<ChartFilter>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPrinting, setIsPrinting] = useState(false)
  const requestIdRef = useRef(0)
  const releasesRequestIdRef = useRef(0)

  useEffect(() => {
    const handleBeforePrint = () => setIsPrinting(true)
    const handleAfterPrint = () => setIsPrinting(false)
    window.addEventListener('beforeprint', handleBeforePrint)
    window.addEventListener('afterprint', handleAfterPrint)
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint)
      window.removeEventListener('afterprint', handleAfterPrint)
    }
  }, [])

  useEffect(() => {
    if (!project) {
      setReleases(null)
      setSelectedId(null)
      return
    }
    const requestId = ++releasesRequestIdRef.current
    setError(null)
    setReleases(null)
    setSelectedId(null)
    listReleases(project.id)
      .then((result) => {
        if (releasesRequestIdRef.current !== requestId) return
        setReleases(result)
        setSelectedId((current) => {
          if (current && result.some((r) => r.id === current)) return current
          return pickDefaultRelease(result)?.id ?? null
        })
      })
      .catch((err) => {
        if (releasesRequestIdRef.current !== requestId) return
        setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  useEffect(() => {
    setPage(1)
    setFilter(null)
  }, [selectedId])

  useEffect(() => {
    setPage(1)
  }, [filter])

  useEffect(() => {
    if (!selectedId || !project) {
      setBurndown([])
      setDefects([])
      return
    }
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    Promise.all([
      getBurndown(selectedId),
      listDefects({ project_id: project.id, release_id: selectedId, limit: DEFECT_FETCH_LIMIT }),
    ])
      .then(([burndownResult, defectsResult]) => {
        if (requestIdRef.current !== requestId) return
        setBurndown(burndownResult)
        setDefects(defectsResult.items)
      })
      .catch((err) => {
        if (requestIdRef.current !== requestId) return
        setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return
        setLoading(false)
      })
  }, [selectedId, project?.id])

  const selectedRelease = releases?.find((r) => r.id === selectedId) ?? null

  const sortedDefects = useMemo(() => [...defects].sort(compareDefectsBySeverity), [defects])
  const openDefects = useMemo(() => sortedDefects.filter((d) => d.status !== 'Closed'), [sortedDefects])

  const severityCounts = useMemo(() => {
    const counts: Record<DefectSeverity, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 }
    for (const d of openDefects) {
      if (d.severity && d.severity in counts) counts[d.severity as DefectSeverity]++
    }
    return counts
  }, [openDefects])

  const statusCounts = useMemo(() => {
    const counts: Record<DefectStatus, number> = { Open: 0, Fixed: 0, Closed: 0, 'Wont-Fix': 0 }
    for (const d of sortedDefects) {
      if (d.status in counts) counts[d.status as DefectStatus]++
    }
    return counts
  }, [sortedDefects])

  const filteredDefects = useMemo(() => {
    if (!filter) return sortedDefects
    if (filter.type === 'severity') return openDefects.filter((d) => d.severity === filter.value)
    return sortedDefects.filter((d) => d.status === filter.value)
  }, [sortedDefects, openDefects, filter])

  const passRate =
    selectedRelease && selectedRelease.total_test_cases > 0
      ? Math.round((selectedRelease.pass_count / selectedRelease.total_test_cases) * 100)
      : 0

  if (!project) {
    return <p className="px-4 text-sm text-muted-foreground">Vui lòng chọn một dự án.</p>
  }

  if (releases && releases.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Release Report</CardTitle>
        </CardHeader>
        <p className="px-4 pb-4 text-sm text-muted-foreground">Chưa có release nào.</p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-heading text-xl font-semibold">Release Report</h1>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={selectedId ? String(selectedId) : undefined} onValueChange={(value) => setSelectedId(Number(value))}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="Chọn release" />
            </SelectTrigger>
            <SelectContent>
              {(releases ?? []).map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.version_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" disabled={!selectedRelease} onClick={() => window.print()}>
            <Download />
            Xuất báo cáo (PDF)
          </Button>
        </div>
      </div>

      {selectedRelease && (
        <div className="hidden print:block">
          <h1 className="text-2xl font-bold">Release Report</h1>
          <p className="text-sm text-muted-foreground">
            {project.name} · {selectedRelease.version_name}
          </p>
          <p className="text-sm text-muted-foreground">Ngày xuất: {formatDate(new Date().toISOString())}</p>
          <div className="my-3 border-b" />
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">Đang tải...</p>}

      {selectedRelease && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Pass Rate" value={`${passRate}%`} />
            <StatTile label="Total Test Cases" value={selectedRelease.total_test_cases} />
          </div>

          <Card className="p-4">
            <ExecutionStatusBar
              passCount={selectedRelease.pass_count}
              failCount={selectedRelease.fail_count}
              notRunCount={selectedRelease.not_run_count}
            />
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-sm font-medium">Burn-down</h2>
            <BurndownChart points={burndown} />
          </Card>

          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Open Defects" value={openDefects.length} />
            <StatTile label="Critical Defects" value={severityCounts.Critical} />
            <StatTile label="High Defects" value={severityCounts.High} />
          </div>

          <Card className="p-4">
            <h2 className="mb-2 text-sm font-medium">Defects theo mức độ (chưa đóng)</h2>
            <DefectSeverityChart
              counts={severityCounts}
              selected={filter?.type === 'severity' ? filter.value : null}
              onSelect={(severity) =>
                setFilter((current) =>
                  current?.type === 'severity' && current.value === severity
                    ? null
                    : { type: 'severity', value: severity },
                )
              }
            />
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-sm font-medium">Danh sách Defects</h2>
            <DefectList
              items={filteredDefects}
              page={page}
              onPageChange={setPage}
              pageSize={isPrinting ? Math.max(filteredDefects.length, 1) : undefined}
            />
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-sm font-medium">Defects theo trạng thái</h2>
            <DefectStatusChart
              counts={statusCounts}
              selected={filter?.type === 'status' ? filter.value : null}
              onSelect={(status) =>
                setFilter((current) =>
                  current?.type === 'status' && current.value === status ? null : { type: 'status', value: status },
                )
              }
            />
          </Card>

          <div className="hidden pt-2 text-center text-xs text-muted-foreground print:block">
            Được tạo bởi QMS · {formatDate(new Date().toISOString())}
          </div>
        </>
      )}
    </div>
  )
}
