import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { TraceabilityStatus } from '@/lib/traceability'
import type { DerivedRequirement } from './deriveTraceability'
import { activeStatusesForChips, type RunStatusChip } from './traceabilityFilters'

const MAX_MATRIX_COLUMNS = 120

type MatrixColumn = { id: number; code: string }

function deriveColumns(items: DerivedRequirement[]): MatrixColumn[] {
  return items.flatMap((req) => req.test_cases.map((tc) => ({ id: tc.id, code: tc.code })))
}

const CELL_STATUS_CLASS: Record<TraceabilityStatus, string> = {
  covered: 'bg-emerald-500',
  failed: 'bg-destructive',
  skipped: 'bg-amber-400',
  not_run: 'bg-muted',
}

function useViewportBoundedHeight(bottomMargin = 24) {
  const ref = useRef<HTMLDivElement>(null)
  const [maxHeight, setMaxHeight] = useState<number>()

  useEffect(() => {
    function update() {
      if (!ref.current) return
      const top = ref.current.getBoundingClientRect().top
      setMaxHeight(Math.max(window.innerHeight - top - bottomMargin, 200))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [bottomMargin])

  return { ref, maxHeight }
}

export function MatrixView({
  requirements,
  runStatusChips,
  moduleFilterActive,
}: {
  requirements: DerivedRequirement[]
  runStatusChips: ReadonlySet<RunStatusChip>
  moduleFilterActive: boolean
}) {
  const { ref, maxHeight } = useViewportBoundedHeight()
  const activeStatuses = useMemo(() => activeStatusesForChips(runStatusChips), [runStatusChips])
  const allColumns = useMemo(() => deriveColumns(requirements), [requirements])
  const columns = allColumns.slice(0, MAX_MATRIX_COLUMNS)
  const isCapped = allColumns.length > columns.length

  if (requirements.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">Không có requirement khớp bộ lọc.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {!moduleFilterActive && (
        <div className="mx-4 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          Ma trận đang trải rộng toàn bộ module — chọn 1 module để các ô nằm gần nhau và dễ đọc hơn.
        </div>
      )}
      <Table containerRef={ref} containerClassName="overflow-y-auto" containerStyle={{ maxHeight }}>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-10 bg-card">Requirement</TableHead>
            {columns.map((col) => (
              <TableHead key={col.id} className="text-center">{col.code}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {requirements.map((req) => {
            const statusByTcId = new Map(req.test_cases.map((tc) => [tc.id, tc.status]))
            return (
              <TableRow key={req.id}>
                <TableCell className="sticky left-0 z-10 bg-card">
                  <Link to={`/requirements/${req.id}`} className="text-primary underline-offset-4 hover:underline">
                    {req.req_id}
                  </Link>
                  <div className="max-w-48 truncate text-xs text-muted-foreground">{req.title}</div>
                </TableCell>
                {columns.map((col) => {
                  const status = statusByTcId.get(col.id)
                  const show = status !== undefined && activeStatuses.has(status)
                  return (
                    <TableCell key={col.id} className="text-center">
                      {status !== undefined && (
                        <span
                          className={cn(
                            'mx-auto block size-4 rounded-sm',
                            show ? CELL_STATUS_CLASS[status] : 'bg-muted/40',
                          )}
                          aria-label={status}
                        />
                      )}
                    </TableCell>
                  )
                })}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {isCapped && (
        <p className="px-4 text-xs text-muted-foreground">
          Hiển thị {columns.length}/{allColumns.length} test case — thu hẹp bộ lọc để xem phần còn lại.
        </p>
      )}
    </div>
  )
}
