import { cn } from '@/lib/utils'

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
    </div>
  )
}
