import { useId } from 'react'
import type { ReactNode } from 'react'
import { Card } from './Card'
interface EmptyStateProps {
  icon: ReactNode
  title: string
  children: ReactNode
  action?: ReactNode
}
export function EmptyState({ icon, title, children, action }: EmptyStateProps) {
  const titleId = useId()
  return (
    <Card className="empty-state" aria-labelledby={titleId}>
      <span className="empty-icon" aria-hidden="true">
        {icon}
      </span>
      <h2 className="empty-title" id={titleId}>
        {title}
      </h2>
      <p className="empty-description">{children}</p>
      {action}
    </Card>
  )
}
