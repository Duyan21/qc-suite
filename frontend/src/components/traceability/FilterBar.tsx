import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { MOCK_MODULES } from './mockModule'
import {
  ALL_RUN_STATUS_CHIPS,
  type CoverageFilterValue,
  type RunStatusChip,
  type TraceabilityFilters,
} from './traceabilityFilters'

const COVERAGE_OPTIONS: { value: CoverageFilterValue; label: string }[] = [
  { value: 'all', label: 'Mọi coverage' },
  { value: 'full', label: 'Full coverage' },
  { value: 'partial', label: 'Partial' },
  { value: 'none', label: 'Không có TC' },
]

const RUN_STATUS_LABELS: Record<RunStatusChip, string> = {
  run: 'Run',
  not_run: 'Not Run',
  skip: 'Skip',
}

const RUN_STATUS_DOT_CLASS: Record<RunStatusChip, string> = {
  run: 'bg-emerald-500',
  not_run: 'bg-muted-foreground/40',
  skip: 'bg-amber-500',
}

export function FilterBar({
  filters,
  onFiltersChange,
}: {
  filters: TraceabilityFilters
  onFiltersChange: (next: TraceabilityFilters) => void
}) {
  function toggleChip(chip: RunStatusChip) {
    const next = new Set(filters.runStatusChips)
    if (next.has(chip)) next.delete(chip)
    else next.add(chip)
    onFiltersChange({ ...filters, runStatusChips: next })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            placeholder="Tìm REQ-ID, TC-ID hoặc nội dung..."
            className="pl-8"
          />
        </div>
        <Select
          value={filters.module}
          onValueChange={(value) => onFiltersChange({ ...filters, module: value as TraceabilityFilters['module'] })}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Mọi module" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Mọi module</SelectItem>
            {MOCK_MODULES.map((module) => (
              <SelectItem key={module} value={module}>
                {module}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.coverage}
          onValueChange={(value) => onFiltersChange({ ...filters, coverage: value as CoverageFilterValue })}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Mọi coverage" />
          </SelectTrigger>
          <SelectContent>
            {COVERAGE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Run Status</span>
        {ALL_RUN_STATUS_CHIPS.map((chip) => {
          const active = filters.runStatusChips.has(chip)
          return (
            <Button
              key={chip}
              type="button"
              variant={active ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => toggleChip(chip)}
              aria-pressed={active}
              className={cn(!active && 'text-muted-foreground')}
            >
              <span className={cn('size-2 rounded-full', RUN_STATUS_DOT_CLASS[chip])} />
              {RUN_STATUS_LABELS[chip]}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
