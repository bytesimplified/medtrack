import { CalendarDays, ChartNoAxesCombined, Pill } from 'lucide-react'
import type { Page } from '../navigation/usePage'
const pages = [
  { id: 'today', label: 'Today', icon: CalendarDays },
  { id: 'medicines', label: 'Medicines', icon: Pill },
  { id: 'insights', label: 'Insights', icon: ChartNoAxesCombined },
] as const
export function Navigation({ page }: { page: Page }) {
  return (
    <nav className="primary-nav" aria-label="Main navigation">
      {pages.map(({ id, label, icon: Icon }) => (
        <a
          key={id}
          href={`#${id}`}
          className="nav-link"
          aria-current={page === id ? 'page' : undefined}
        >
          <Icon size={21} aria-hidden="true" />
          {label}
        </a>
      ))}
    </nav>
  )
}
