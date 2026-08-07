import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useCurrentProject } from '@/lib/currentProject'
import { getTraceability, type TraceabilityResponse } from '@/lib/traceability'

export function TraceabilityPage() {
  const { project } = useCurrentProject()
  const [data, setData] = useState<TraceabilityResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!project) {
      setData(null)
      return
    }
    load(project.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  function load(projectId: number) {
    setLoading(true)
    setError(null)
    getTraceability(projectId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra'))
      .finally(() => setLoading(false))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Traceability Matrix</CardTitle>
      </CardHeader>
      {!project && (
        <p className="px-4 text-sm text-muted-foreground">Vui lòng chọn một dự án.</p>
      )}
      {project && loading && (
        <p className="px-4 text-sm text-muted-foreground">Đang tải...</p>
      )}
      {project && error && (
        <div className="flex items-center gap-3 px-4">
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={() => load(project.id)}>
            Thử lại
          </Button>
        </div>
      )}
      {project && !loading && !error && data && data.items.length === 0 && (
        <p className="px-4 text-sm text-muted-foreground">Chưa có yêu cầu nào.</p>
      )}
      {project && !loading && !error && data && data.items.length > 0 && (
        <p className="px-4 text-sm text-muted-foreground">
          {data.items.length} requirement(s) loaded — matrix rendering lands in Task 6.
        </p>
      )}
    </Card>
  )
}
