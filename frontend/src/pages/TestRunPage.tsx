import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { ProgressBar } from '@/components/ProgressBar'
import { CreateReleaseDialog } from '@/components/CreateReleaseDialog'
import { useCurrentProject } from '@/lib/currentProject'
import { formatDate } from '@/lib/utils'
import { listReleases, RELEASE_STATUS_BADGE_CLASS, type Release, type ReleaseStatus } from '@/lib/releases'
import { useToast } from '@/lib/toast'

const STATUS_TABS: Array<{ value: ReleaseStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'New', label: 'New' },
  { value: 'InProgress', label: 'Đang chạy' },
  { value: 'Completed', label: 'Completed' },
]

export function TestRunPage() {
  const { project } = useCurrentProject()
  const toast = useToast()
  const [releases, setReleases] = useState<Release[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ReleaseStatus | 'all'>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!project) {
      setReleases(null)
      return
    }
    load(project.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  function load(projectId: number) {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    listReleases(projectId)
      .then((result) => {
        if (requestIdRef.current !== requestId) return
        setReleases(result)
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

  const filtered = (releases ?? []).filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (search && !r.version_name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const totalCount = releases?.length ?? 0
  const activeCount = (releases ?? []).filter((r) => r.status === 'InProgress').length
  const completedCount = (releases ?? []).filter((r) => r.status === 'Completed').length
  const totalRun = (releases ?? []).reduce((sum, r) => sum + r.pass_count + r.fail_count, 0)
  const totalPass = (releases ?? []).reduce((sum, r) => sum + r.pass_count, 0)
  const passRate = totalRun > 0 ? Math.round((totalPass / totalRun) * 100) : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-xl font-semibold">Test Runs</h1>
          <p className="text-sm text-muted-foreground">Danh sách Releases — Chọn release để xem test runs</p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)} disabled={!project} className="w-full sm:w-auto">
          <Plus />
          Tạo Release mới
        </Button>
      </div>

      {releases && releases.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="gap-1.5 p-4">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Tổng Releases</div>
            <div className="text-2xl font-semibold">{totalCount}</div>
          </Card>
          <Card className="gap-1.5 p-4">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Đang hoạt động</div>
            <div className="text-2xl font-semibold">{activeCount}</div>
          </Card>
          <Card className="gap-1.5 p-4">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Hoàn tất</div>
            <div className="text-2xl font-semibold">{completedCount}</div>
          </Card>
          <Card className="gap-1.5 p-4">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Pass Rate TB</div>
            <div className="text-2xl font-semibold">{passRate}%</div>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            placeholder="Tìm release..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-xs"
          />
          <div className="flex overflow-hidden rounded-lg border">
            {STATUS_TABS.map((tab) => (
              <Button
                key={tab.value}
                type="button"
                variant={statusFilter === tab.value ? 'secondary' : 'ghost'}
                size="sm"
                className="rounded-none border-0"
                onClick={() => setStatusFilter(tab.value)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </CardHeader>

        {!project && <p className="px-4 text-sm text-muted-foreground">Vui lòng chọn một dự án.</p>}
        {project && loading && <p className="px-4 text-sm text-muted-foreground">Đang tải...</p>}
        {project && error && (
          <div className="flex items-center gap-3 px-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={() => load(project.id)}>
              Thử lại
            </Button>
          </div>
        )}
        {project && !loading && !error && filtered.length === 0 && (
          <p className="px-4 text-sm text-muted-foreground">Không tìm thấy release nào.</p>
        )}
        {project && !loading && !error && filtered.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Release</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Test Cases</TableHead>
                <TableHead>Tiến độ</TableHead>
                <TableHead>Target</TableHead>
                <TableHead className="pr-4">Owner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((release) => {
                const progress = release.total_test_cases > 0 ? release.pass_count / release.total_test_cases : 0
                return (
                  <TableRow key={release.id}>
                    <TableCell className="pl-4">
                      <Link to={`/testruns/${release.id}`} className="text-primary underline-offset-4 hover:underline">
                        {release.version_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge className={RELEASE_STATUS_BADGE_CLASS[release.status] ?? ''}>{release.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {release.pass_count}/{release.total_test_cases} pass
                      {release.fail_count > 0 && <span className="text-destructive"> · {release.fail_count} fail</span>}
                    </TableCell>
                    <TableCell className="w-32">
                      <ProgressBar value={progress} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {release.target_date ? formatDate(release.target_date) : '—'}
                    </TableCell>
                    <TableCell className="pr-4 text-muted-foreground">{release.owner_name ?? '—'}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {project && (
        <CreateReleaseDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          projectId={project.id}
          onCreated={(release) => {
            load(project.id)
            toast.success(`Đã tạo release ${release.version_name}.`, {
              href: `/testruns/${release.id}`,
              linkLabel: 'Xem release →',
            })
          }}
        />
      )}
    </div>
  )
}
