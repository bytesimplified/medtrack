import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { Input } from '../../../src/components/ui/Input'
import { Button } from '../../../src/components/ui/Button'
it('associates labels, hints, and errors with a form field', () => {
  render(
    <Input
      label="Medicine name"
      hint="Use the label on your medicine."
      error="Enter a name."
      required
    />,
  )
  const input = screen.getByRole('textbox', { name: 'Medicine name' })
  expect(input).toBeRequired()
  expect(input).toHaveAccessibleDescription(
    'Use the label on your medicine. Enter a name.',
  )
  expect(input).toHaveAttribute('aria-invalid', 'true')
})
it('defaults to a non-submitting button and respects disabled actions', () => {
  const onClick = vi.fn()
  render(
    <Button disabled onClick={onClick}>
      Save
    </Button>,
  )
  const button = screen.getByRole('button', { name: 'Save' })
  expect(button).toHaveAttribute('type', 'button')
  fireEvent.click(button)
  expect(onClick).not.toHaveBeenCalled()
})
