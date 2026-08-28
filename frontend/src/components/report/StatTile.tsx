import { Card } from '@/components/ui/card'

export function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="gap-1.5 p-4">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </Card>
  )
}
