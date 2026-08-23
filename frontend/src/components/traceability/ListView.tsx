import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { DerivedRequirement } from './deriveTraceability'
import { RequirementRow } from './RequirementRow'
import type { RunStatusChip } from './traceabilityFilters'

const PAGE_SIZE = 40

export function ListView({
  requirements,
  runStatusChips,
}: {
  requirements: DerivedRequirement[]
  runStatusChips: ReadonlySet<RunStatusChip>
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // Reset paging/expansion whenever the filtered set itself changes (new
  // array identity from a fresh `filterRequirements` call in the parent).
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
    setExpandedId(null)
  }, [requirements])

  if (requirements.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">Không có requirement khớp bộ lọc.</p>
  }

  const visible = requirements.slice(0, visibleCount)
  const hasMore = visibleCount < requirements.length

  return (
    <div className="flex flex-col">
      <div className="flex flex-col">
        {visible.map((req) => (
          <RequirementRow
            key={req.id}
            requirement={req}
            runStatusChips={runStatusChips}
            expanded={expandedId === req.id}
            onToggleExpand={() => setExpandedId((current) => (current === req.id ? null : req.id))}
          />
        ))}
      </div>
      {hasMore && (
        <div className="flex justify-center border-t p-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          >
            Tải thêm {Math.min(PAGE_SIZE, requirements.length - visibleCount)} requirement ({visible.length}/{requirements.length})
          </Button>
        </div>
      )}
    </div>
  )
}
