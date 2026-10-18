import type { ComponentProps } from 'react'
export function Button({
  className = '',
  type = 'button',
  ...props
}: ComponentProps<'button'>) {
  return <button type={type} className={`button ${className}`} {...props} />
}
