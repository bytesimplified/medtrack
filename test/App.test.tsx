import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../src/App'
function navigate(hash: string) {
  act(() => {
    window.history.replaceState(null, '', hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}
beforeEach(() => window.history.replaceState(null, '', '/'))
describe('application navigation', () => {
  it('opens Today with links to all three pages', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: 'Today', level: 1 }),
    ).toBeVisible()
    const nav = within(
      screen.getByRole('navigation', { name: 'Main navigation' }),
    )
    for (const label of ['Today', 'Medicines', 'Insights']) {
      expect(nav.getByRole('link', { name: label })).toHaveAttribute(
        'href',
        `#${label.toLowerCase()}`,
      )
    }
    expect(nav.getByRole('link', { name: 'Today' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
  it('restores deep links and handles history changes', () => {
    navigate('#medicines')
    render(<App />)
    expect(
      screen.getByRole('heading', { name: 'Medicines', level: 1 }),
    ).toBeVisible()
    navigate('#insights')
    expect(
      screen.getByRole('heading', { name: 'Insights', level: 1 }),
    ).toBeVisible()
    expect(document.title).toBe('Insights · MedTrack')
    expect(screen.getByRole('main')).toHaveFocus()
    navigate('#medicines')
    expect(
      screen.getByRole('heading', { name: 'Medicines', level: 1 }),
    ).toBeVisible()
  })
  it('falls back to Today for an unknown route', () => {
    navigate('#unknown')
    render(<App />)
    expect(
      screen.getByRole('heading', { name: 'Today', level: 1 }),
    ).toBeVisible()
  })
  it('skips to content without changing the selected page', () => {
    navigate('#insights')
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: 'Skip to content' }))
    expect(screen.getByRole('main')).toHaveFocus()
    expect(window.location.hash).toBe('#insights')
  })
})
