import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { DefectStatus } from '@/lib/defects'

const STATUS_COLORS: Record<DefectStatus, string> = {
  Open: '#3b82f6',
  Fixed: '#22c55e',
  Closed: '#9ca3af',
  'Wont-Fix': '#111827',
}

const STATUSES: DefectStatus[] = ['Open', 'Fixed', 'Closed', 'Wont-Fix']

type DefectStatusChartProps = {
  counts: Record<DefectStatus, number>
  selected: DefectStatus | null
  onSelect: (status: DefectStatus) => void
}

export function DefectStatusChart({ counts, selected, onSelect }: DefectStatusChartProps) {
  const data = STATUSES.map((status) => ({ status, count: counts[status] ?? 0 })).filter((d) => d.count > 0)

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Không có defect nào.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Tooltip />
        <Pie
          data={data}
          dataKey="count"
          nameKey="status"
          cx="50%"
          cy="50%"
          outerRadius={80}
          cursor="pointer"
          onClick={(entry) => onSelect(entry.status as DefectStatus)}
        >
          {data.map((entry) => (
            <Cell
              key={entry.status}
              fill={STATUS_COLORS[entry.status]}
              opacity={selected === null || selected === entry.status ? 1 : 0.3}
            />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  )
}
