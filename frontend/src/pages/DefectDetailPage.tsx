import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { useCurrentProject } from '@/lib/currentProject'
import {
  getDefect,
  DEFECT_SEVERITY_BADGE_CLASS,
  DEFECT_STATUS_BADGE_CLASS,
  type DefectDetail,
} from '@/lib/defects'
import { EditDefectDialog } from '@/components/EditDefectDialog'
import { useToast } from '@/lib/toast'

export function DefectDetailPage() {
  const { id } = useParams()
  const toast = useToast()
  const { project } = useCurrentProject()
  const [defect, setDefect] = useState<DefectDetail | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!id) return
    const numericId = Number(id)
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    setNotFound(false)
    getDefect(numericId)
      .then((d) => {
        if (requestIdRef.current !== requestId) return
        setDefect(d)
      })
      .catch((err) => {
        if (requestIdRef.current !== requestId) return
        if (err instanceof Error && err.message.includes('not found')) {
          setNotFound(true)
        } else {
          setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
        }
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return
        setLoading(false)
      })
  }, [id])

  if (loading) {
    return <p className="px-4 text-sm text-muted-foreground">Đang tải...</p>
  }

  if (notFound) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-2 pt-4">
          <p className="text-sm text-muted-foreground">Không tìm thấy defect này.</p>
          <Link to="/defects" className="text-sm text-primary underline-offset-4 hover:underline">
            ← Quay lại danh sách Defects
          </Link>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return <p className="px-4 text-sm text-destructive">{error}</p>
  }

  if (!defect) return null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link to="/defects" className="hover:underline">Defects</Link> {'>'} {defect.code}
          </p>
          <h1 className="font-heading text-xl font-semibold">
            {defect.code}: {defect.title}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!project}
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="size-3.5" />
            Sửa
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Badge className={DEFECT_SEVERITY_BADGE_CLASS[defect.severity ?? ''] ?? ''}>
              {defect.severity ?? '—'}
            </Badge>
            <Badge className={DEFECT_STATUS_BADGE_CLASS[defect.status] ?? ''}>{defect.status}</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div>
              <h2 className="mb-1 text-sm font-medium">Mô tả</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {defect.description ?? '—'}
              </p>
            </div>
            <div>
              <h2 className="mb-2 text-sm font-medium">Liên kết</h2>
              <dl className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Test Case</dt>
                  <dd>
                    {defect.test_case ? (
                      <Link
                        to={`/testcases/${defect.test_case.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {defect.test_case.code}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Requirement</dt>
                  <dd>
                    {defect.requirement ? (
                      <Link
                        to={`/requirements/${defect.requirement.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {defect.requirement.req_id}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Thông tin</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Code</dt>
                <dd>{defect.code}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Found in version</dt>
                <dd>{defect.found_in_version ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Fixed in version</dt>
                <dd>{defect.fixed_in_version ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Created</dt>
                <dd>{formatDate(defect.created_at)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      {project && (
        <EditDefectDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          defect={defect}
          onUpdated={(updated) => {
            setDefect((d) => (d ? { ...d, ...updated } : d))
            toast.success(`Đã cập nhật defect ${updated.code}.`)
          }}
        />
      )}
    </div>
  )
}
