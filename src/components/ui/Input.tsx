import { useId } from 'react'
import type { ComponentProps } from 'react'
interface InputProps extends ComponentProps<'input'> {
  label: string
  hint?: string
  error?: string
}
export function Input({
  label,
  hint,
  error,
  id,
  className = '',
  ...props
}: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const describedBy =
    [
      props['aria-describedby'],
      hint ? `${inputId}-hint` : null,
      error ? `${inputId}-error` : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined
  return (
    <div className="field">
      <label htmlFor={inputId} className="field-label">
        {label}
      </label>
      {hint && (
        <p className="field-hint" id={`${inputId}-hint`}>
          {hint}
        </p>
      )}
      <input
        {...props}
        id={inputId}
        className={`input ${className}`}
        aria-describedby={describedBy}
        aria-invalid={error ? true : props['aria-invalid']}
      />
      {error && (
        <p className="field-error" id={`${inputId}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
