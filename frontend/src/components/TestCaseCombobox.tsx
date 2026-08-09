import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { listTestCases, type TestCaseSummary } from '@/lib/testCases'

type TestCaseComboboxProps = {
  projectId: number
  value: TestCaseSummary | null
  onChange: (testCase: TestCaseSummary) => void
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

export function TestCaseCombobox({ projectId, value, onChange }: TestCaseComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [results, setResults] = useState<TestCaseSummary[]>([])
  const [loading, setLoading] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!open) return
    const requestId = ++requestIdRef.current
    setLoading(true)
    listTestCases({ project_id: projectId, search: debouncedSearch || undefined, limit: 20 })
      .then((result) => {
        if (requestIdRef.current !== requestId) return
        setResults(result.items as TestCaseSummary[])
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
          <span className="truncate">{value ? `${value.code} — ${value.title}` : 'Chọn test case...'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] p-2" align="start">
        <Input
          placeholder="Tìm test case..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2"
          autoFocus
        />
        {loading && <p className="px-1 py-1 text-sm text-muted-foreground">Đang tải...</p>}
        {!loading && results.length === 0 && (
          <p className="px-1 py-1 text-sm text-muted-foreground">Không tìm thấy test case nào.</p>
        )}
        {!loading && results.length > 0 && (
          <div className="flex max-h-60 flex-col gap-0.5 overflow-y-auto">
            {results.map((tc) => (
              <button
                key={tc.id}
                type="button"
                onClick={() => {
                  onChange(tc)
                  setOpen(false)
                }}
                className="cursor-pointer rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span className="font-medium">{tc.code}</span>{' '}
                <span className="text-muted-foreground">{tc.title}</span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
