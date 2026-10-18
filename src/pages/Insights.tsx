import { EmptyState } from '../components/ui/EmptyState'
import { ChartNoAxesCombined } from 'lucide-react'
export function Insights() {
  return (
    <>
      <p className="page-kicker">See the bigger picture</p>
      <h1 className="page-title">Insights</h1>
      <p className="page-description">
        A simple view of your routine over time.
      </p>
      <EmptyState
        icon={<ChartNoAxesCombined size={32} />}
        title="Every day tells a story"
      >
        History and insights are coming soon. Once dose tracking is available,
        your records will help you see your routine.
      </EmptyState>
    </>
  )
}
