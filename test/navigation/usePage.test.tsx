import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { usePage } from '../../src/navigation/usePage'

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

it.each(['medicines', 'insights'])('opens the %s deep link', (page) => {
  window.history.replaceState(null, '', `/#${page}`)

  const { result } = renderHook(usePage)

  expect(result.current).toBe(page)
})

it('opens Today for an unknown route', () => {
  window.history.replaceState(null, '', '/#unknown')

  const { result } = renderHook(usePage)

  expect(result.current).toBe('today')
})

it('updates the selected page when browser navigation changes the hash', () => {
  const { result } = renderHook(usePage)

  act(() => {
    window.history.replaceState(null, '', '/#medicines')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })

  expect(result.current).toBe('medicines')

  act(() => {
    window.history.replaceState(null, '', '/')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })

  expect(result.current).toBe('today')
})
