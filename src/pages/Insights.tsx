import { ChartNoAxesCombined } from 'lucide-react'
export function Insights() {
  return (
    <>
      <p className="page-kicker">See the bigger picture</p>
      <h1 className="page-title">Insights</h1>
      <p className="page-description">
        A simple view of your routine over time.
      </p>
      <section className="card empty-state" aria-labelledby="insights-empty">
        <span className="empty-icon">
          <ChartNoAxesCombined size={32} aria-hidden="true" />
        </span>
        <h2 className="empty-title" id="insights-empty">
          Every day tells a story
        </h2>
        <p className="empty-description">
          History and insights are coming soon. Once dose tracking is available,
          your records will help you see your routine.
        </p>
      </section>
    </>
  )
}
