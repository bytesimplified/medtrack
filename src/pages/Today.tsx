import { CalendarDays } from 'lucide-react'
export function Today() {
  return (
    <>
      <p className="page-kicker">One day at a time</p>
      <h1 className="page-title">Today</h1>
      <p className="page-description">
        A little clarity for your daily medicines.
      </p>
      <section className="card empty-state" aria-labelledby="today-empty">
        <span className="empty-icon">
          <CalendarDays size={32} aria-hidden="true" />
        </span>
        <h2 className="empty-title" id="today-empty">
          Your routine starts here
        </h2>
        <p className="empty-description">
          Your scheduled doses will appear here, with a simple way to record
          each one.
        </p>
        <a href="#medicines">Explore Medicines</a>
      </section>
      <p className="page-note">
        Medicine scheduling and dose logging are coming soon.
      </p>
    </>
  )
}
