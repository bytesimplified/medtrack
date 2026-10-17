import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('application startup', () => {
  it('renders the accessible starter screen without suggesting tracking is available', () => {
    render(<App />)

    const main = within(screen.getByRole('main'))
    expect(
      main.getByRole('heading', { name: 'MedTrack', level: 1 }),
    ).toBeVisible()
    expect(main.getByText(/Medicine tracking is coming soon/)).toBeVisible()
  })
})
