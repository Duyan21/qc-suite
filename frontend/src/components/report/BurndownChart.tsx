import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { BurndownPoint } from '@/lib/releases'
import { formatDate } from '@/lib/utils'

export function BurndownChart({ points }: { points: BurndownPoint[] }) {
  if (points.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Chưa có dữ liệu burn-down.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tickFormatter={(d: string) => formatDate(d)} tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip labelFormatter={(d) => formatDate(d as string)} />
        <Legend />
        <Line type="monotone" dataKey="remaining" name="Thực tế" stroke="#3b82f6" strokeWidth={2} dot={false} />
        <Line
          type="monotone"
          dataKey="expected"
          name="Kỳ vọng"
          stroke="#9ca3af"
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
