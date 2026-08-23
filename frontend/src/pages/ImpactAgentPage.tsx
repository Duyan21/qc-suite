import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Copy, Loader2, Search as SearchIcon, Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCurrentProject } from '@/lib/currentProject'
import {
  getRequirementHistory,
  listRequirements,
  type Requirement,
} from '@/lib/requirements'
import {
  analyseRequirementImpact,
  MOCK_ANALYSIS_RESULT,
  type AgentAnalysisResult,
} from '@/lib/agent'

export function ImpactAgentPage() {
  const { project } = useCurrentProject()
  const navigate = useNavigate()
  const projectId = project?.id ?? null

  const [searchTerm, setSearchTerm] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<Requirement[]>([])
  const [selectedReq, setSelectedReq] = useState<Requirement | null>(null)

  const [compareEnabled, setCompareEnabled] = useState(false)
  const [previousReq, setPreviousReq] = useState<Requirement | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)

  const [analysing, setAnalysing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [result, setResult] = useState<AgentAnalysisResult | null>(null)
  const [dismissedUpdates, setDismissedUpdates] = useState<Set<number>>(new Set())
  const [dismissedGaps, setDismissedGaps] = useState<Set<number>>(new Set())
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const searchRequestId = useRef(0)
  const analyseRequestId = useRef(0)
  const prevProjectIdRef = useRef(projectId)

  useEffect(() => {
    if (prevProjectIdRef.current === projectId) return
    prevProjectIdRef.current = projectId
    setSelectedReq(null)
    setSearchTerm('')
    setSearchResults([])
    setCompareEnabled(false)
    setPreviousReq(null)
    setResult(null)
    setAnalysisError(null)
  }, [projectId])

  useEffect(() => {
    if (!project || searchTerm.trim().length < 2) {
      setSearchResults([])
      return
    }
    const requestId = ++searchRequestId.current
    const timer = setTimeout(() => {
      listRequirements(project.id, { search: searchTerm.trim(), limit: 10 })
        .then((res) => {
          if (searchRequestId.current !== requestId) return
          setSearchResults(res.items)
        })
        .catch(() => {
          if (searchRequestId.current !== requestId) return
          setSearchResults([])
        })
    }, 300)
    return () => clearTimeout(timer)
  }, [project, searchTerm])

  function selectRequirement(req: Requirement) {
    setSelectedReq(req)
    setSearchOpen(false)
    setSearchTerm('')
    setResult(null)
    setAnalysisError(null)
    setPreviousReq(null)
    if (compareEnabled) loadPreviousVersion(req)
  }

  function loadPreviousVersion(req: Requirement) {
    setCompareLoading(true)
    getRequirementHistory(req.req_id)
      .then((history) => {
        const prev = history.find((h) => h.version === req.version - 1) ?? null
        setPreviousReq(prev)
      })
      .catch(() => setPreviousReq(null))
      .finally(() => setCompareLoading(false))
  }

  function toggleCompare(enabled: boolean) {
    setCompareEnabled(enabled)
    if (enabled && selectedReq) loadPreviousVersion(selectedReq)
    if (!enabled) setPreviousReq(null)
  }

  function runAnalysis() {
    if (!selectedReq) return
    const requestId = ++analyseRequestId.current
    setAnalysing(true)
    setAnalysisError(null)
    analyseRequirementImpact(selectedReq.req_id)
      .then((res) => {
        if (analyseRequestId.current !== requestId) return
        setResult(res)
        setDismissedUpdates(new Set())
        setDismissedGaps(new Set())
      })
      .catch((err) => {
        if (analyseRequestId.current !== requestId) return
        setAnalysisError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
        setResult(null)
      })
      .finally(() => {
        if (analyseRequestId.current !== requestId) return
        setAnalysing(false)
      })
  }

  function loadDemoData() {
    setResult(MOCK_ANALYSIS_RESULT)
    setAnalysisError(null)
    setDismissedUpdates(new Set())
    setDismissedGaps(new Set())
  }

  function copyQuestion(text: string, index: number) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedIndex(index)
        setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1500)
      })
      .catch(() => {})
  }

  const visibleUpdates = useMemo(
    () => (result ? result.tc_updates.filter((_, i) => !dismissedUpdates.has(i)) : []),
    [result, dismissedUpdates],
  )
  const visibleGaps = useMemo(
    () => (result ? result.tc_gaps.filter((_, i) => !dismissedGaps.has(i)) : []),
    [result, dismissedGaps],
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-xl font-semibold">Impact Agent</h1>
        <p className="text-sm text-muted-foreground">
          Phân tích ảnh hưởng của một requirement lên test case hiện có và còn thiếu.
        </p>
      </div>

      <Card className="flex flex-col gap-3 p-4">
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start sm:max-w-md"
              disabled={!project}
              onClick={() => setSearchOpen(true)}
            >
              <SearchIcon className="size-4" />
              {selectedReq ? `${selectedReq.req_id} — ${selectedReq.title}` : 'Chọn requirement theo code hoặc title...'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-2 sm:w-96">
            <Input
              autoFocus
              placeholder="Tìm theo code hoặc title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
              {searchTerm.trim().length < 2 && (
                <p className="px-2 py-1 text-sm text-muted-foreground">Gõ ít nhất 2 ký tự.</p>
              )}
              {searchTerm.trim().length >= 2 && searchResults.length === 0 && (
                <p className="px-2 py-1 text-sm text-muted-foreground">Không tìm thấy requirement.</p>
              )}
              {searchResults.map((req) => (
                <button
                  key={req.id}
                  type="button"
                  onClick={() => selectRequirement(req)}
                  className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span className="font-mono text-primary">{req.req_id}</span>{' '}
                  <span>{req.title}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {!project && <p className="text-sm text-muted-foreground">Vui lòng chọn một dự án.</p>}

        {selectedReq && (
          <>
            <div className="flex items-center gap-2">
              <Switch checked={compareEnabled} onCheckedChange={toggleCompare} id="compare-toggle" />
              <label htmlFor="compare-toggle" className="text-sm">
                So sánh với version trước
              </label>
            </div>

            {!compareEnabled && (
              <Textarea readOnly value={selectedReq.description} className="min-h-32" />
            )}

            {compareEnabled && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    {previousReq ? `Version ${previousReq.version} (cũ)` : compareLoading ? 'Đang tải...' : 'Không có version trước'}
                  </p>
                  <Textarea readOnly value={previousReq?.description ?? ''} className="min-h-32" />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Version {selectedReq.version} (mới)
                  </p>
                  <Textarea readOnly value={selectedReq.description} className="min-h-32" />
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button type="button" onClick={runAnalysis} disabled={analysing}>
                {analysing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {analysing ? 'Đang phân tích... (~5–8 giây)' : 'Analyse Impact'}
              </Button>
              {import.meta.env.DEV && (
                <Button type="button" variant="ghost" size="sm" onClick={loadDemoData}>
                  Load demo data
                </Button>
              )}
            </div>

            {analysisError && (
              <div className="flex items-center gap-3">
                <p className="text-sm text-destructive">{analysisError}</p>
                <Button size="sm" variant="outline" onClick={runAnalysis}>
                  Thử lại
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {result && (
        <>
          <p className="text-sm text-muted-foreground">
            Analysed {result.summary.linked_tc_count} linked TCs + {result.summary.related_tc_count} related TCs · {result.summary.defect_count} defects
          </p>

          <Card className="flex flex-col gap-3 p-4">
            <h2 className="font-semibold">TC cần cập nhật ({visibleUpdates.length})</h2>
            {visibleUpdates.length === 0 && (
              <p className="text-sm text-muted-foreground">Không có đề xuất cập nhật.</p>
            )}
            {result.tc_updates.map((update, index) =>
              dismissedUpdates.has(index) ? null : (
                <Card key={index} className="flex flex-col gap-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-primary">{update.code}</span>
                    <span className="font-semibold">{update.title}</span>
                  </div>
                  <p className="text-sm">{update.reason}</p>
                  <div className="flex flex-col gap-1 text-sm">
                    <p className="rounded bg-red-100 px-2 py-1 text-red-700 line-through dark:bg-red-500/15 dark:text-red-400">
                      {update.diff.before}
                    </p>
                    <p className="rounded bg-emerald-100 px-2 py-1 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                      {update.diff.after}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {update.source.map((tag) => (
                      <Badge key={tag} className="bg-muted text-muted-foreground">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => navigate(`/testcases/${update.testcase_id}`)}>
                      Open TC
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDismissedUpdates((prev) => new Set(prev).add(index))}
                    >
                      Dismiss
                    </Button>
                  </div>
                </Card>
              ),
            )}
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <h2 className="font-semibold">TC cần thêm mới ({visibleGaps.length})</h2>
            {visibleGaps.length === 0 && (
              <p className="text-sm text-muted-foreground">Không có đề xuất TC mới.</p>
            )}
            {result.tc_gaps.map((gap, index) =>
              dismissedGaps.has(index) ? null : (
                <Card key={index} className="flex flex-col gap-2 p-3">
                  <p className="font-semibold">{gap.suggested_title}</p>
                  <p className="text-sm">{gap.suggested_scope}</p>
                  <div className="flex flex-wrap gap-1">
                    {gap.source.map((src, srcIndex) => (
                      <Badge key={srcIndex} className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                        {src.type}:{src.ref} · {Math.round(src.match_percent)}% match
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => navigate('/testcases')}>
                      Create TC
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDismissedGaps((prev) => new Set(prev).add(index))}
                    >
                      Dismiss
                    </Button>
                  </div>
                </Card>
              ),
            )}
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <h2 className="font-semibold">Câu hỏi cần xác nhận ({result.questions.length})</h2>
            {result.questions.length === 0 && (
              <p className="text-sm text-muted-foreground">Không có câu hỏi cần xác nhận.</p>
            )}
            {result.questions.map((q, index) => (
              <Card key={index} className="flex flex-col gap-2 p-3">
                <p className="font-bold">{q.question}</p>
                <p className="text-sm text-muted-foreground">{q.why_it_matters}</p>
                <div className="flex flex-wrap gap-1">
                  {q.source.map((tag) => (
                    <Badge key={tag} className="bg-muted text-muted-foreground">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <Button size="sm" variant="outline" onClick={() => copyQuestion(q.question, index)}>
                  {copiedIndex === index ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copiedIndex === index ? 'Copied' : 'Copy'}
                </Button>
              </Card>
            ))}
          </Card>
        </>
      )}
    </div>
  )
}
