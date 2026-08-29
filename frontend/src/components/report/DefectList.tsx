import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DEFECT_SEVERITY_BADGE_CLASS, DEFECT_STATUS_BADGE_CLASS, type DefectListItem } from '@/lib/defects'

const PAGE_SIZE = 10

type DefectListProps = {
  items: DefectListItem[]
  page: number
  onPageChange: (page: number) => void
}

export function DefectList({ items, page, onPageChange }: DefectListProps) {
  const navigate = useNavigate()
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (items.length === 0) {
    return <p className="px-1 py-6 text-sm text-muted-foreground">Không tìm thấy defect nào.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {pageItems.map((d) => (
        <Card
          key={d.id}
          role="button"
          tabIndex={0}
          onClick={() => navigate(`/defects/${d.id}`)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              navigate(`/defects/${d.id}`)
            }
          }}
          className="flex-row items-center justify-between gap-3 p-3 cursor-pointer transition-colors hover:bg-muted/50"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{d.title}</p>
            <p className="text-xs text-muted-foreground">{d.assignee_name ?? 'Chưa gán'}</p>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-muted-foreground">{d.description ?? ''}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge className={DEFECT_SEVERITY_BADGE_CLASS[d.severity ?? ''] ?? ''}>{d.severity ?? '—'}</Badge>
            <Badge className={DEFECT_STATUS_BADGE_CLASS[d.status] ?? ''}>{d.status}</Badge>
          </div>
        </Card>
      ))}
      <div className="flex items-center justify-between pt-2">
        <p className="text-sm text-muted-foreground">Trang {page} / {totalPages}</p>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>
            ← Trước
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          >
            Sau →
          </Button>
        </div>
      </div>
    </div>
  )
}
