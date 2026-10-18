import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from '../../src/components/AppErrorBoundary'

const consoleError = vi
  .spyOn(console, 'error')
  .mockImplementation(() => undefined)

function BrokenView(): never {
  throw new Error('test render failure')
}

beforeEach(() => consoleError.mockClear())

it('shows an accessible recovery screen when a child render fails', () => {
  render(
    <AppErrorBoundary>
      <BrokenView />
    </AppErrorBoundary>,
  )

  expect(screen.getByRole('alert')).toHaveTextContent('MedTrack hit a problem')
  expect(
    screen.getByText(/saved data stays on this device/i),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Reload app' })).toBeEnabled()
  expect(consoleError).toHaveBeenCalled()
})
