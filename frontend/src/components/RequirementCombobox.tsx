import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { listRequirements, type RequirementSummary } from '@/lib/requirements'

type RequirementComboboxProps = {
  projectId: number
  value: RequirementSummary | null
  onChange: (requirement: RequirementSummary) => void
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

export function RequirementCombobox({ projectId, value, onChange }: RequirementComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [results, setResults] = useState<RequirementSummary[]>([])
  const [loading, setLoading] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!open) return
    const requestId = ++requestIdRef.current
    setLoading(true)
    listRequirements(projectId, { search: debouncedSearch || undefined, limit: 20 })
      .then((result) => {
        if (requestIdRef.current !== requestId) return
        setResults(result.items)
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return
        setResults([])
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return
        setLoading(false)
      })
  }, [open, projectId, debouncedSearch])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-start overflow-hidden font-normal">
          <span className="truncate">{value ? `${value.req_id} — ${value.title}` : 'Chọn requirement...'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <Input
          placeholder="Tìm requirement..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2"
          autoFocus
        />
        {loading && <p className="px-1 py-1 text-sm text-muted-foreground">Đang tải...</p>}
        {!loading && results.length === 0 && (
          <p className="px-1 py-1 text-sm text-muted-foreground">Không tìm thấy requirement nào.</p>
        )}
        {!loading && results.length > 0 && (
          <div className="flex max-h-60 flex-col gap-0.5 overflow-y-auto">
            {results.map((req) => (
              <button
                key={req.id}
                type="button"
                onClick={() => {
                  onChange(req)
                  setOpen(false)
                }}
                className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span className="font-medium">{req.req_id}</span>{' '}
                <span className="text-muted-foreground">{req.title}</span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
