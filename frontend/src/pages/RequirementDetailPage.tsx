import { useParams } from 'react-router-dom'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'

export function RequirementDetailPage() {
  const { id } = useParams()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Requirement #{id}</CardTitle>
      </CardHeader>
    </Card>
  )
}
