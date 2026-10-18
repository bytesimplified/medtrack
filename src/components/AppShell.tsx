import { Pill } from 'lucide-react'
import type { ReactNode } from 'react'

interface AppShellProps {
  children: ReactNode
  navigation?: ReactNode
  settings?: ReactNode
}

export function AppShell({ children, navigation, settings }: AppShellProps) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="app-header">
        <a className="brand" href="#today" aria-label="MedTrack home">
          <span className="brand-icon">
            <Pill aria-hidden="true" size={24} />
          </span>
          <span>
            MedTrack<span className="brand-caption">Your daily companion</span>
          </span>
        </a>
        {settings}
      </header>
      {navigation}
      <main id="main-content" className="app-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}
