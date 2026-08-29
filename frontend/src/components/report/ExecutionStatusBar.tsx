export function ExecutionStatusBar({
  passCount,
  failCount,
  notRunCount,
}: {
  passCount: number
  failCount: number
  notRunCount: number
}) {
  const total = passCount + failCount + notRunCount
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {passCount > 0 && <div className="h-full bg-emerald-500" style={{ width: `${pct(passCount)}%` }} />}
        {failCount > 0 && <div className="h-full bg-red-500" style={{ width: `${pct(failCount)}%` }} />}
        {notRunCount > 0 && <div className="h-full bg-blue-500" style={{ width: `${pct(notRunCount)}%` }} />}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500" /> Pass ({passCount})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-red-500" /> Fail ({failCount})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-blue-500" /> Not Run ({notRunCount})
        </span>
      </div>
    </div>
  )
}
