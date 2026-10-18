import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ThemePicker } from './ThemePicker'
import { THEME_KEY } from './useTheme'
let dark = false
let listeners: Set<() => void>
beforeEach(() => {
  window.localStorage.clear()
  dark = false
  listeners = new Set()
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return dark
    },
    addEventListener: (_name: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_name: string, listener: () => void) =>
      listeners.delete(listener),
  }))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})
function systemDark(value: boolean) {
  act(() => {
    dark = value
    listeners.forEach((listener) => listener())
  })
}
it('follows device changes by default and removes its listener on unmount', () => {
  const view = render(<ThemePicker />)
  expect(screen.getByRole('button', { name: 'Device theme' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  systemDark(true)
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  view.unmount()
  expect(listeners.size).toBe(0)
})
it('persists an explicit choice, restores it, and ignores device changes until reset', () => {
  const view = render(<ThemePicker />)
  fireEvent.click(screen.getByRole('button', { name: 'Dark theme' }))
  expect(window.localStorage.getItem(THEME_KEY)).toBe('dark')
  systemDark(false)
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  view.unmount()
  render(<ThemePicker />)
  expect(screen.getByRole('button', { name: 'Dark theme' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Device theme' }))
  expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  expect(window.localStorage.getItem(THEME_KEY)).toBe('system')
})
it('falls back safely for corrupt saved preferences', () => {
  window.localStorage.setItem(THEME_KEY, 'unknown')
  render(<ThemePicker />)
  expect(screen.getByRole('button', { name: 'Device theme' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})
it('remains usable when preference storage is blocked', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('Blocked', 'SecurityError')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Blocked', 'SecurityError')
  })
  render(<ThemePicker />)
  fireEvent.click(screen.getByRole('button', { name: 'Dark theme' }))
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  expect(screen.getByRole('status')).toHaveTextContent(
    'Theme changed for this visit',
  )
})
