import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, X, Diamond } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useCurrentProject } from '@/lib/currentProject'
import {
  getTraceability,
  type TraceabilityResponse,
  type TraceabilityRequirementItem,
  type TraceabilityStatus,
} from '@/lib/traceability'

type Column = { id: number; code: string }

function deriveColumns(items: TraceabilityRequirementItem[]): Column[] {
  return items.flatMap((req) => req.test_cases.map((tc) => ({ id: tc.id, code: tc.code })))
}

function computeStats(items: TraceabilityRequirementItem[]) {
  const allTestCases = items.flatMap((r) => r.test_cases)
  const totalLinked = allTestCases.length
  const executed = allTestCases.filter((tc) => tc.status === 'covered' || tc.status === 'failed').length
  const covered = allTestCases.filter((tc) => tc.status === 'covered').length
  return { totalLinked, executed, covered }
}

function StatusIcon({ status }: { status: TraceabilityStatus }) {
  if (status === 'covered') return <Check className="size-4 text-green-600" aria-label="Pass" />
  if (status === 'failed') return <X className="size-4 text-destructive" aria-label="Fail" />
  return <Diamond className="size-4 text-blue-500" aria-label="Linked — not run" />
}

function TraceabilityMatrix({ items }: { items: TraceabilityRequirementItem[] }) {
  const columns = deriveColumns(items)

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="sticky left-0 z-10 bg-card">Requirement</TableHead>
          {columns.map((col) => (
            <TableHead key={col.id}>{col.code}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((req) => {
          const statusByTcId = new Map(req.test_cases.map((tc) => [tc.id, tc.status]))
          return (
            <TableRow key={req.id}>
              <TableCell className="sticky left-0 z-10 bg-card">
                <Link to={`/requirements/${req.id}`} className="text-primary underline-offset-4 hover:underline">
                  {req.req_id}
                </Link>
                <div className="text-xs text-muted-foreground">{req.title}</div>
              </TableCell>
              {columns.map((col) => {
                const status = statusByTcId.get(col.id)
                return (
                  <TableCell key={col.id}>
                    {status && <StatusIcon status={status} />}
                  </TableCell>
                )
              })}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function TraceabilityLegend() {
  return (
    <div className="flex items-center gap-4 px-4 text-sm text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <Check className="size-4 text-green-600" /> Pass
      </span>
      <span className="flex items-center gap-1.5">
        <X className="size-4 text-destructive" /> Fail
      </span>
      <span className="flex items-center gap-1.5">
        <Diamond className="size-4 text-blue-500" /> Linked — not run
      </span>
    </div>
  )
}

export function TraceabilityPage() {
  const { project } = useCurrentProject()
  const [data, setData] = useState<TraceabilityResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Traceability Matrix</CardTitle>
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
          <Button size="sm" variant="outline" onClick={() => load(project.id)}>
            Thử lại
          </Button>
        </div>
      )}
      {project && !loading && !error && data && data.items.length === 0 && (
        <p className="px-4 text-sm text-muted-foreground">Chưa có yêu cầu nào.</p>
      )}
      {project && !loading && !error && data && data.items.length > 0 && (() => {
        const { totalLinked, executed, covered } = computeStats(data.items)
        return (
          <p className="px-4 text-sm text-muted-foreground">
            {totalLinked === 0
              ? 'Chưa có test case nào được liên kết.'
              : `Độ bao phủ: ${Math.round((covered / totalLinked) * 100)}% · ${executed} / ${totalLinked} TC đã thực thi`}
          </p>
        )
      })()}
      {project && !loading && !error && data && data.items.length > 0 && (
        <>
          <TraceabilityLegend />
          <TraceabilityMatrix items={data.items} />
        </>
      )}
    </Card>
  )
}
