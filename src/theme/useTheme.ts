import { useEffect, useState } from 'react'
export type Theme = 'system' | 'light' | 'dark'
export const THEME_KEY = 'medtrack.theme'
function initialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return 'system'
  }
}
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [saveError, setSaveError] = useState(false)
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media?.matches ? 'dark' : 'light') : theme
    }
    apply()
    media?.addEventListener('change', apply)
    return () => media?.removeEventListener('change', apply)
  }, [theme])
  function chooseTheme(next: Theme) {
    setTheme(next)
    try {
      window.localStorage.setItem(THEME_KEY, next)
      setSaveError(false)
    } catch {
      setSaveError(true)
    }
  }
  return { theme, chooseTheme, saveError }
}
