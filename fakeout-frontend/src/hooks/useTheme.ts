import { useCallback, useEffect, useState } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'fakeout-theme'

function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return preference
}

function applyTheme(preference: ThemePreference) {
  const resolved = resolveTheme(preference)
  document.documentElement.setAttribute('data-theme', resolved)

  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', resolved === 'dark' ? '#13111a' : '#f4f2f8')
}

/** Call once before React mounts to avoid flash */
export function initTheme() {
  const stored = (localStorage.getItem(STORAGE_KEY) as ThemePreference | null) ?? 'system'
  applyTheme(stored)
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    return (localStorage.getItem(STORAGE_KEY) as ThemePreference | null) ?? 'system'
  })

  const resolved = resolveTheme(preference)

  useEffect(() => {
    applyTheme(preference)
    localStorage.setItem(STORAGE_KEY, preference)
  }, [preference])

  useEffect(() => {
    if (preference !== 'system') return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    function onChange() {
      applyTheme('system')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [preference])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
  }, [])

  const toggle = useCallback(() => {
    setPreferenceState(prev => {
      const current = resolveTheme(prev)
      return current === 'dark' ? 'light' : 'dark'
    })
  }, [])

  return { preference, resolved, setPreference, toggle }
}
