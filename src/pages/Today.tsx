import { EmptyState } from '../components/ui/EmptyState'
import { CalendarDays } from 'lucide-react'
export function Today() {
  return (
    <>
      <p className="page-kicker">One day at a time</p>
      <h1 className="page-title">Today</h1>
      <p className="page-description">
        A little clarity for your daily medicines.
      </p>
      <EmptyState
        icon={<CalendarDays size={32} />}
        title="Your routine starts here"
        action={
          <a className="button" href="#medicines">
            Explore Medicines
          </a>
        }
      >
        Your scheduled doses will appear here, with a simple way to record each
        one.
      </EmptyState>
      <p className="page-note">
        Medicine scheduling and dose logging are coming soon.
      </p>
    </>
  )
}
