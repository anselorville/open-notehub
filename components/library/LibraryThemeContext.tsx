'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import {
  DEFAULT_LIBRARY_THEME,
  LIBRARY_THEME_STORAGE_KEY,
  normalizeLibraryTheme,
  type LibraryTheme,
} from '@/lib/library-theme'

interface LibraryThemeContextValue {
  ready: boolean
  theme: LibraryTheme
  setTheme: (theme: LibraryTheme) => void
}

const LibraryThemeContext = createContext<LibraryThemeContextValue | null>(null)

export function LibraryThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<LibraryTheme>(DEFAULT_LIBRARY_THEME)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(LIBRARY_THEME_STORAGE_KEY)
    const normalizedTheme = normalizeLibraryTheme(storedTheme)
    if (normalizedTheme) {
      setThemeState(normalizedTheme)
    }
    setReady(true)
  }, [])

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== LIBRARY_THEME_STORAGE_KEY) return
      const normalizedTheme = normalizeLibraryTheme(event.newValue)
      if (normalizedTheme) {
        setThemeState(normalizedTheme)
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  function setTheme(nextTheme: LibraryTheme) {
    setThemeState(nextTheme)
    window.localStorage.setItem(LIBRARY_THEME_STORAGE_KEY, nextTheme)
  }

  return (
    <LibraryThemeContext.Provider value={{ ready, theme, setTheme }}>
      {children}
    </LibraryThemeContext.Provider>
  )
}

export function useLibraryTheme() {
  const context = useContext(LibraryThemeContext)
  if (!context) {
    throw new Error('useLibraryTheme must be used within a LibraryThemeProvider')
  }
  return context
}
