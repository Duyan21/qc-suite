import { useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { useCurrentProject } from '@/lib/currentProject'
import { listModules, type Module } from '@/lib/modules'
import { getTraceability } from '@/lib/traceability'
import { deriveRequirements, computeTraceabilityStats } from '@/components/traceability/deriveTraceability'
import { listDefects, type DefectListItem, type DefectSeverity } from '@/lib/defects'
import { StatTile } from '@/components/report/StatTile'
import { DefectSeverityChart } from '@/components/report/DefectSeverityChart'
import { DefectList } from '@/components/report/DefectList'

const DEFECT_FETCH_LIMIT = 200

export function DashboardPage() {
  const { project } = useCurrentProject()
  const [modules, setModules] = useState<Module[] | null>(null)
  const [coveragePercent, setCoveragePercent] = useState<number | null>(null)
  const [defects, setDefects] = useState<DefectListItem[]>([])
  const [severityFilter, setSeverityFilter] = useState<DefectSeverity | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!project) {
      setModules(null)
      setCoveragePercent(null)
      setDefects([])
      return
    }
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    Promise.all([
      listModules(project.id),
      getTraceability(project.id),
      listDefects({ project_id: project.id, status: 'Open', limit: DEFECT_FETCH_LIMIT }),
    ])
      .then(([modulesResult, traceabilityResult, defectsResult]) => {
        if (requestIdRef.current !== requestId) return
        setModules(modulesResult)
        setCoveragePercent(computeTraceabilityStats(deriveRequirements(traceabilityResult.items)).coveragePercent)
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
  }, [project?.id])

  useEffect(() => {
    setPage(1)
  }, [severityFilter])

  const severityCounts = useMemo(() => {
    const counts: Record<DefectSeverity, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 }
    for (const d of defects) {
      if (d.severity && d.severity in counts) counts[d.severity as DefectSeverity]++
    }
    return counts
  }, [defects])

  const filteredDefects = useMemo(() => {
    if (!severityFilter) return defects
    return defects.filter((d) => d.severity === severityFilter)
  }, [defects, severityFilter])

  if (!project) {
    return <p className="px-4 text-sm text-muted-foreground">Vui lòng chọn một dự án.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <h1 className="font-heading text-xl font-semibold">{project.name}</h1>
        {project.description && <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>}
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">Đang tải...</p>}

      {!loading && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Số module" value={modules?.length ?? 0} />
            <StatTile
              label="Độ phủ Traceability"
              value={coveragePercent !== null ? `${Math.round(coveragePercent * 100)}%` : '—'}
            />
            <StatTile label="Defects đang mở" value={defects.length} />
          </div>

          <Card className="p-4">
            <h2 className="mb-2 text-sm font-medium">Defects theo mức độ (đang mở)</h2>
            <DefectSeverityChart
              counts={severityCounts}
              selected={severityFilter}
              onSelect={(severity) => setSeverityFilter((current) => (current === severity ? null : severity))}
            />
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-sm font-medium">Danh sách Defects</h2>
            <DefectList items={filteredDefects} page={page} onPageChange={setPage} />
          </Card>
        </>
      )}
    </div>
  )
}
