import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { listRequirements, type RequirementSummary } from '@/lib/requirements'
import { listTestCases, type TestCaseSummary } from '@/lib/testCases'
import { addTestCasesToRelease, type ReleaseTestCaseItem } from '@/lib/releases'

type AddTestCasesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  releaseId: number
  projectId: number
  onAdded: (items: ReleaseTestCaseItem[]) => void
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

export function AddTestCasesDialog({ open, onOpenChange, releaseId, projectId, onAdded }: AddTestCasesDialogProps) {
  const [tab, setTab] = useState<'requirement' | 'testcase'>('requirement')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [requirementResults, setRequirementResults] = useState<RequirementSummary[]>([])
  const [testCaseResults, setTestCaseResults] = useState<TestCaseSummary[]>([])
  const [selectedRequirementIds, setSelectedRequirementIds] = useState<Set<number>>(new Set())
  const [selectedTestCaseIds, setSelectedTestCaseIds] = useState<Set<number>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!open) return
    const requestId = ++requestIdRef.current
    if (tab === 'requirement') {
      listRequirements(projectId, { search: debouncedSearch || undefined, limit: 30 }).then((result) => {
        if (requestIdRef.current !== requestId) return
        setRequirementResults(result.items)
      })
    } else {
      listTestCases({ project_id: projectId, search: debouncedSearch || undefined, limit: 30 }).then((result) => {
        if (requestIdRef.current !== requestId) return
        setTestCaseResults(result.items.map((tc) => ({ id: tc.id, code: tc.code, title: tc.title, status: tc.status })))
      })
    }
  }, [open, tab, projectId, debouncedSearch])

  function toggleRequirement(id: number) {
    setSelectedRequirementIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleTestCase(id: number) {
    setSelectedTestCaseIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function reset() {
    setSearch('')
    setSelectedRequirementIds(new Set())
    setSelectedTestCaseIds(new Set())
    setError(null)
  }

  async function handleSubmit() {
    if (selectedRequirementIds.size === 0 && selectedTestCaseIds.size === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const items = await addTestCasesToRelease(releaseId, {
        testcase_ids: selectedTestCaseIds.size > 0 ? [...selectedTestCaseIds] : undefined,
        requirement_ids: selectedRequirementIds.size > 0 ? [...selectedRequirementIds] : undefined,
      })
      reset()
      onOpenChange(false)
      onAdded(items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedCount = selectedRequirementIds.size + selectedTestCaseIds.size

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Thêm test case vào release</DialogTitle>
          <DialogDescription>
            Chọn theo requirement (thêm toàn bộ test case liên kết) hoặc chọn từng test case riêng lẻ.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'requirement' | 'testcase')}>
          <TabsList>
            <TabsTrigger value="requirement">Theo Requirement</TabsTrigger>
            <TabsTrigger value="testcase">Theo Test Case</TabsTrigger>
          </TabsList>

          <Input
            placeholder={tab === 'requirement' ? 'Tìm requirement...' : 'Tìm test case...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="my-2"
          />

          <TabsContent value="requirement" className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
            {requirementResults.length === 0 && (
              <p className="px-1 py-2 text-sm text-muted-foreground">Không tìm thấy requirement nào.</p>
            )}
            {requirementResults.map((req) => (
              <label
                key={req.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox checked={selectedRequirementIds.has(req.id)} onCheckedChange={() => toggleRequirement(req.id)} />
                <span className="font-medium">{req.req_id}</span>
                <span className="truncate text-muted-foreground">{req.title}</span>
              </label>
            ))}
          </TabsContent>

          <TabsContent value="testcase" className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
            {testCaseResults.length === 0 && (
              <p className="px-1 py-2 text-sm text-muted-foreground">Không tìm thấy test case nào.</p>
            )}
            {testCaseResults.map((tc) => (
              <label
                key={tc.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox checked={selectedTestCaseIds.has(tc.id)} onCheckedChange={() => toggleTestCase(tc.id)} />
                <span className="font-medium">{tc.code}</span>
                <span className="truncate text-muted-foreground">{tc.title}</span>
              </label>
            ))}
          </TabsContent>
        </Tabs>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="button" disabled={submitting || selectedCount === 0} onClick={handleSubmit}>
            {submitting ? 'Đang thêm...' : `Thêm${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
