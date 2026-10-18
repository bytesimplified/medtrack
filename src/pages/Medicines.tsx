import { Pill } from 'lucide-react'
export function Medicines() {
  return (
    <>
      <p className="page-kicker">A place for your routine</p>
      <h1 className="page-title">Medicines</h1>
      <p className="page-description">
        Your medicines, schedules, and stock in one place.
      </p>
      <section className="card empty-state" aria-labelledby="medicines-empty">
        <span className="empty-icon">
          <Pill size={32} aria-hidden="true" />
        </span>
        <h2 className="empty-title" id="medicines-empty">
          A fresh start
        </h2>
        <p className="empty-description">
          Medicine registration is coming soon. You’ll be able to add your
          medicines and set up your routine here.
        </p>
      </section>
    </>
  )
}
