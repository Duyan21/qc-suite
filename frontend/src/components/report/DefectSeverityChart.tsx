import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DefectSeverity } from '@/lib/defects'

const SEVERITY_COLORS: Record<DefectSeverity, string> = {
  Critical: '#ef4444',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#9ca3af',
}

const SEVERITIES: DefectSeverity[] = ['Critical', 'High', 'Medium', 'Low']

type DefectSeverityChartProps = {
  counts: Record<DefectSeverity, number>
  selected: DefectSeverity | null
  onSelect: (severity: DefectSeverity) => void
}

export function DefectSeverityChart({ counts, selected, onSelect }: DefectSeverityChartProps) {
  const data = SEVERITIES.map((severity) => ({ severity, count: counts[severity] ?? 0 }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <XAxis dataKey="severity" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="count" cursor="pointer" onClick={(entry) => onSelect((entry.payload as { severity: DefectSeverity }).severity)}>
          {data.map((entry) => (
            <Cell
              key={entry.severity}
              fill={SEVERITY_COLORS[entry.severity]}
              opacity={selected === null || selected === entry.severity ? 1 : 0.3}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
