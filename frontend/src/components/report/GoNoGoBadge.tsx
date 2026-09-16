import { Badge } from '@/components/ui/badge'
import type { GoNoGoStatus } from '@/lib/goNoGo'

const STYLE: Record<GoNoGoStatus, string> = {
  Go: 'bg-green-500 text-white',
  Caution: 'bg-yellow-500 text-black',
  'No-Go': 'bg-red-500 text-white',
}

const LABEL: Record<GoNoGoStatus, string> = {
  Go: 'Go',
  Caution: 'Caution',
  'No-Go': 'No-Go',
}

export function GoNoGoBadge({ status }: { status: GoNoGoStatus }) {
  return <Badge className={`h-6 px-3 text-sm font-semibold ${STYLE[status]}`}>{LABEL[status]}</Badge>
}
