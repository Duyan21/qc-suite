import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { ProgressBar } from '@/components/ProgressBar'
import { formatDate } from '@/lib/utils'
import { useToast } from '@/lib/toast'
import {
  getRelease,
  listReleaseTestCases,
  updateReleaseStatus,
  getExecutionHistory,
  RELEASE_STATUS_BADGE_CLASS,
  CURRENT_RESULT_BADGE_CLASS,
  type Release,
  type ReleaseTestCaseItem,
  type ExecutionHistoryItem,
} from '@/lib/releases'
import { AddTestCasesDialog } from '@/components/AddTestCasesDialog'
import { ExecuteTestCaseDialog } from '@/components/ExecuteTestCaseDialog'
import { RemoveTestCaseDialog } from '@/components/RemoveTestCaseDialog'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export function ReleaseDetailPage() {
  const { id } = useParams()
  const toast = useToast()
  const releaseId = Number(id)
  const [release, setRelease] = useState<Release | null>(null)
  const [items, setItems] = useState<ReleaseTestCaseItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [executeTarget, setExecuteTarget] = useState<{ id: number; code: string } | null>(null)
  const [removeTarget, setRemoveTarget] = useState<{ id: number; code: string } | null>(null)
  const [historyTarget, setHistoryTarget] = useState<{ id: number; code: string } | null>(null)
  const [history, setHistory] = useState<ExecutionHistoryItem[] | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  // Bumped after an execution so the open history panel re-fetches — neither
  // historyTarget nor releaseId changes when a new execution is recorded.
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const requestIdRef = useRef(0)
  const historyRequestIdRef = useRef(0)

  function load() {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    Promise.all([getRelease(releaseId), listReleaseTestCases(releaseId)])
      .then(([r, tcs]) => {
        if (requestIdRef.current !== requestId) return
        setRelease(r)
        setItems(tcs)
      })
      .catch((err) => {
        if (requestIdRef.current !== requestId) return
        setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return
        setLoading(false)
      })
  }

  useEffect(() => {
    if (!releaseId) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [releaseId])

  useEffect(() => {
    setHistory(null)
    setHistoryError(null)
    if (!historyTarget) return
    const requestId = ++historyRequestIdRef.current
    getExecutionHistory(releaseId, historyTarget.id)
      .then((result) => {
        if (historyRequestIdRef.current !== requestId) return
        setHistory(result)
      })
      .catch((err) => {
        if (historyRequestIdRef.current !== requestId) return
        setHistoryError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
      })
  }, [historyTarget, releaseId, historyRefreshKey])

  async function handleMarkCompleted() {
    try {
      const updated = await updateReleaseStatus(releaseId, 'Completed')
      setRelease(updated)
      toast.success('Đã đánh dấu release hoàn tất.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
    }
  }

  if (loading && !release) return <p className="px-4 text-sm text-muted-foreground">Đang tải...</p>
  if (error) return <p className="px-4 text-sm text-destructive">{error}</p>
  if (!release || !items) return null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link to="/testruns" className="hover:underline">Test Runs</Link> {'>'} {release.version_name}
          </p>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-xl font-semibold">{release.version_name}</h1>
            <Badge className={RELEASE_STATUS_BADGE_CLASS[release.status] ?? ''}>{release.status}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {release.status !== 'Completed' && (
            <Button type="button" variant="outline" size="sm" onClick={handleMarkCompleted}>
              Đánh dấu hoàn tất
            </Button>
          )}
          <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" />
            Thêm test case
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="gap-1.5 p-4">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Tổng</div>
          <div className="text-2xl font-semibold">{release.total_test_cases}</div>
        </Card>
        <Card className="gap-1.5 p-4">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Pass</div>
          <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{release.pass_count}</div>
        </Card>
        <Card className="gap-1.5 p-4">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Fail</div>
          <div className="text-2xl font-semibold text-destructive">{release.fail_count}</div>
        </Card>
        <Card className="gap-1.5 p-4">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Not Run</div>
          <div className="text-2xl font-semibold">{release.not_run_count}</div>
        </Card>
      </div>
      <ProgressBar value={release.total_test_cases > 0 ? release.pass_count / release.total_test_cases : 0} />

      <Card>
        {items.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">Chưa có test case nào trong release này.</p>
        )}
        {items.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Test Case</TableHead>
                <TableHead>Requirement</TableHead>
                <TableHead>Kết quả</TableHead>
                <TableHead>Thêm bởi</TableHead>
                <TableHead className="pr-4">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="pl-4">
                    <Link to={`/testcases/${item.testcase.id}`} className="text-primary underline-offset-4 hover:underline">
                      {item.testcase.code}
                    </Link>{' '}
                    <span className="text-muted-foreground">{item.testcase.title}</span>
                  </TableCell>
                  <TableCell>
                    {item.testcase.requirement ? (
                      <Link
                        to={`/requirements/${item.testcase.requirement.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {item.testcase.requirement.req_id}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setHistoryTarget({ id: item.testcase.id, code: item.testcase.code })}
                      className="cursor-pointer"
                    >
                      <Badge className={CURRENT_RESULT_BADGE_CLASS[item.current_result] ?? ''}>
                        {item.current_result}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.added_by_name ?? '—'}</TableCell>
                  <TableCell className="pr-4">
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setExecuteTarget({ id: item.testcase.id, code: item.testcase.code })}
                      >
                        Thực thi
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="Bỏ khỏi release"
                        onClick={() => setRemoveTarget({ id: item.testcase.id, code: item.testcase.code })}
                      >
                        <X />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {historyTarget && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Lịch sử thực thi — {historyTarget.code}</CardTitle>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => setHistoryTarget(null)}>
              <X />
            </Button>
          </CardHeader>
          <CardContent>
            {history === null && !historyError && <p className="text-sm text-muted-foreground">Đang tải...</p>}
            {historyError && <p className="text-sm text-destructive">{historyError}</p>}
            {history !== null && history.length === 0 && (
              <p className="text-sm text-muted-foreground">Chưa có lần thực thi nào.</p>
            )}
            {history !== null && history.length > 0 && (
              <div className="flex flex-col gap-3">
                {history.map((h) => (
                  <div key={h.id} className="flex flex-col gap-1 border-b pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <Badge className={CURRENT_RESULT_BADGE_CLASS[h.result] ?? ''}>{h.result}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {h.executed_by_name ?? '—'} · {formatDate(h.executed_at)}
                      </span>
                    </div>
                    {h.note && <p className="text-sm">{h.note}</p>}
                    {h.images.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {h.images.map((img) => (
                          <a key={img.id} href={`${BASE_URL}${img.url}`} target="_blank" rel="noreferrer">
                            <img
                              src={`${BASE_URL}${img.url}`}
                              alt="Evidence"
                              className="size-16 rounded-md object-cover ring-1 ring-border"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <AddTestCasesDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        releaseId={releaseId}
        projectId={release.project_id}
        onAdded={() => {
          load()
          toast.success('Đã thêm test case vào release.')
        }}
      />
      <ExecuteTestCaseDialog
        open={executeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setExecuteTarget(null)
        }}
        releaseId={releaseId}
        testCase={executeTarget}
        onExecuted={() => {
          load()
          setHistoryRefreshKey((k) => k + 1)
          toast.success('Đã lưu kết quả thực thi.')
        }}
      />
      <RemoveTestCaseDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
        releaseId={releaseId}
        testCase={removeTarget}
        onRemoved={(removedId) => {
          load()
          // The removed test case is no longer in the release, so its history
          // panel can't meaningfully be refreshed — close it instead.
          if (historyTarget?.id === removedId) setHistoryTarget(null)
          toast.success(`Đã bỏ ${removeTarget?.code ?? ''} khỏi release.`)
        }}
      />
    </div>
  )
}
