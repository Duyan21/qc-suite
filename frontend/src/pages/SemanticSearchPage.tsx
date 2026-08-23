import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Loader2, Search as SearchIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCurrentProject } from '@/lib/currentProject'
import {
  searchTestCases,
  matchScoreTier,
  MATCH_SCORE_BADGE_CLASS,
  type SearchResultItem,
} from '@/lib/search'
import { TC_PRIORITY_BADGE_CLASS, TC_STATUS_BADGE_CLASS } from '@/lib/testCases'

type PriorityFilter = 'all' | 'High' | 'Medium' | 'Low'
type ResultFilter = 'all' | 'Pass' | 'Fail' | 'Skip' | 'Blocked' | 'not-run'

const PRIORITY_OPTIONS: { key: PriorityFilter; label: string }[] = [
  { key: 'all', label: 'Priority: All' },
  { key: 'High', label: 'High' },
  { key: 'Medium', label: 'Medium' },
  { key: 'Low', label: 'Low' },
]

const RESULT_OPTIONS: { key: ResultFilter; label: string }[] = [
  { key: 'all', label: 'Result: All' },
  { key: 'Pass', label: 'Pass' },
  { key: 'Fail', label: 'Fail' },
  { key: 'Skip', label: 'Skip' },
  { key: 'Blocked', label: 'Blocked' },
  { key: 'not-run', label: 'Not run' },
]

type CachedSearchState = {
  projectId: number | null
  query: string
  results: SearchResultItem[] | null
  priorityFilter: PriorityFilter
  resultFilter: ResultFilter
  checkedIds: Set<number>
}

let cachedSearchState: CachedSearchState = {
  projectId: null,
  query: '',
  results: null,
  priorityFilter: 'all',
  resultFilter: 'all',
  checkedIds: new Set(),
}

function matchesFilters(item: SearchResultItem, priority: PriorityFilter, result: ResultFilter): boolean {
  if (priority !== 'all' && item.priority !== priority) return false
  if (result !== 'all') {
    if (result === 'not-run') {
      if (item.last_result !== null) return false
    } else if (item.last_result !== result) {
      return false
    }
  }
  return true
}

const EXAMPLE_QUERY = 'e.g. login with wrong password multiple times'

export function SemanticSearchPage() {
  const { project } = useCurrentProject()
  const navigate = useNavigate()
  const projectId = project?.id ?? null
  const cacheMatches = cachedSearchState.projectId === projectId

  const [query, setQuery] = useState(cacheMatches ? cachedSearchState.query : '')
  const [results, setResults] = useState<SearchResultItem[] | null>(cacheMatches ? cachedSearchState.results : null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>(
    cacheMatches ? cachedSearchState.priorityFilter : 'all',
  )
  const [resultFilter, setResultFilter] = useState<ResultFilter>(
    cacheMatches ? cachedSearchState.resultFilter : 'all',
  )
  const [checkedIds, setCheckedIds] = useState<Set<number>>(
    cacheMatches ? cachedSearchState.checkedIds : new Set(),
  )
  const requestIdRef = useRef(0)
  const prevProjectIdRef = useRef(projectId)

  useEffect(() => {
    cachedSearchState = { projectId, query, results, priorityFilter, resultFilter, checkedIds }
  })

  useEffect(() => {
    if (prevProjectIdRef.current === projectId) return
    prevProjectIdRef.current = projectId
    setQuery('')
    setResults(null)
    setPriorityFilter('all')
    setResultFilter('all')
    setCheckedIds(new Set())
  }, [projectId])

  function toggleChecked(id: number) {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function runSearch() {
    if (!project || !query.trim()) return
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    searchTestCases({ project_id: project.id, query: query.trim() })
      .then((res) => {
        if (requestIdRef.current !== requestId) return
        setResults(res.items)
        setPriorityFilter('all')
        setResultFilter('all')
        setCheckedIds(new Set())
      })
      .catch((err) => {
        if (requestIdRef.current !== requestId) return
        setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
        setResults(null)
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return
        setLoading(false)
      })
  }

  const filteredResults = useMemo(() => {
    if (!results) return []
    return results.filter((item) => matchesFilters(item, priorityFilter, resultFilter))
  }, [results, priorityFilter, resultFilter])

  const priorityCounts = useMemo(() => {
    const counts: Record<PriorityFilter, number> = { all: 0, High: 0, Medium: 0, Low: 0 }
    if (!results) return counts
    counts.all = results.length
    for (const item of results) {
      if (item.priority === 'High') counts.High++
      else if (item.priority === 'Medium') counts.Medium++
      else if (item.priority === 'Low') counts.Low++
    }
    return counts
  }, [results])

  const priorityScopedResults = useMemo(() => {
    if (!results) return []
    if (priorityFilter === 'all') return results
    return results.filter((item) => item.priority === priorityFilter)
  }, [results, priorityFilter])

  const resultCounts = useMemo(() => {
    const counts: Record<ResultFilter, number> = { all: 0, Pass: 0, Fail: 0, Skip: 0, Blocked: 0, 'not-run': 0 }
    counts.all = priorityScopedResults.length
    for (const item of priorityScopedResults) {
      if (item.last_result === null) counts['not-run']++
      else if (item.last_result === 'Pass') counts.Pass++
      else if (item.last_result === 'Fail') counts.Fail++
      else if (item.last_result === 'Skip') counts.Skip++
      else if (item.last_result === 'Blocked') counts.Blocked++
    }
    return counts
  }, [priorityScopedResults])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-xl font-semibold">Semantic Search</h1>
        <p className="text-sm text-muted-foreground">
          {results ? `${filteredResults.length} kết quả` : 'Tìm test case theo ngữ nghĩa, không chỉ theo từ khóa.'}
        </p>
      </div>

      <Card>
        <div className="flex flex-col gap-3 px-4 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder={EXAMPLE_QUERY}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runSearch()
              }}
              disabled={!project}
              className="sm:max-w-md md:text-base"
            />
            <Button type="button" onClick={runSearch} disabled={!project || !query.trim() || loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <SearchIcon className="size-4" />}
              Search
            </Button>
          </div>

          {results && results.length > 0 && (
            <>
              <div className="border-t" />
              <div className="flex flex-wrap items-center gap-2">
                <Select value={priorityFilter} onValueChange={(value) => setPriorityFilter(value as PriorityFilter)}>
                  <SelectTrigger className="w-full text-base sm:w-40">
                    <SelectValue placeholder="Priority: All" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((f) => (
                      <SelectItem key={f.key} value={f.key}>
                        {f.label} ({priorityCounts[f.key]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={resultFilter} onValueChange={(value) => setResultFilter(value as ResultFilter)}>
                  <SelectTrigger className="w-full text-base sm:w-40">
                    <SelectValue placeholder="Result: All" />
                  </SelectTrigger>
                  <SelectContent>
                    {RESULT_OPTIONS.map((f) => (
                      <SelectItem key={f.key} value={f.key}>
                        {f.key === 'all' ? f.label : `${f.label} (${resultCounts[f.key]})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Result counts depend on the selected Priority — pick Priority first, then narrow by Result.
              </p>
            </>
          )}
        </div>

        {!project && (
          <p className="px-4 pb-4 text-sm text-muted-foreground">Vui lòng chọn một dự án.</p>
        )}
        {project && loading && (
          <p className="px-4 pb-4 text-sm text-muted-foreground">Đang tìm kiếm...</p>
        )}
        {project && !loading && error && (
          <div className="flex items-center gap-3 px-4 pb-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={runSearch}>
              Thử lại
            </Button>
          </div>
        )}
        {project && !loading && !error && results && results.length === 0 && (
          <p className="px-4 pb-4 text-sm text-muted-foreground">0 kết quả.</p>
        )}
        {project && !loading && !error && results && results.length > 0 && filteredResults.length === 0 && (
          <p className="px-4 pb-4 text-sm text-muted-foreground">0 kết quả khớp bộ lọc.</p>
        )}
        {project && !loading && !error && filteredResults.length > 0 && (
          <div className="flex flex-col gap-2 px-4 pb-4">
            {filteredResults.map((item) => {
              const tier = matchScoreTier(item.score)
              return (
                <Card
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/testcases/${item.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(`/testcases/${item.id}`)
                    }
                  }}
                  className="cursor-pointer flex-row gap-3 p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/testcases/${item.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-mono text-primary underline-offset-4 hover:underline"
                      >
                        {item.code}
                      </Link>
                      <Badge className={MATCH_SCORE_BADGE_CLASS[tier]}>
                        {Math.round(item.score * 100)}% match
                      </Badge>
                      {item.priority && (
                        <Badge className={TC_PRIORITY_BADGE_CLASS[item.priority] ?? ''}>{item.priority}</Badge>
                      )}
                      <Badge className={TC_STATUS_BADGE_CLASS[item.status] ?? ''}>{item.status}</Badge>
                    </div>
                    <p className="mt-1 font-semibold">{item.title}</p>
                    {item.requirement && (
                      <Link
                        to={`/requirements/${item.requirement.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-sm text-primary underline-offset-4 hover:underline"
                      >
                        {item.requirement.req_id}
                      </Link>
                    )}
                  </div>
                  <div
                    className="flex shrink-0 items-center pl-2"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={checkedIds.has(item.id)}
                      onCheckedChange={() => toggleChecked(item.id)}
                      aria-label={`Mark ${item.code} to check`}
                    />
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
