import { useSyncExternalStore } from 'react'
export type Page = 'today' | 'medicines' | 'insights'
function getPage(): Page {
  const page = window.location.hash.slice(1)
  return page === 'medicines' || page === 'insights' ? page : 'today'
}
function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}
// Hash links support refresh and browser Back/Forward without server rewrites.
export function usePage() {
  return useSyncExternalStore(subscribe, getPage, () => 'today' as const)
}
