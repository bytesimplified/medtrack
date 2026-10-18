import { EmptyState } from '../components/ui/EmptyState'
import { Pill } from 'lucide-react'
export function Medicines() {
  return (
    <>
      <p className="page-kicker">A place for your routine</p>
      <h1 className="page-title">Medicines</h1>
      <p className="page-description">
        Your medicines, schedules, and stock in one place.
      </p>
      <EmptyState icon={<Pill size={32} />} title="A fresh start">
        Medicine registration is coming soon. You’ll be able to add your
        medicines and set up your routine here.
      </EmptyState>
    </>
  )
}
