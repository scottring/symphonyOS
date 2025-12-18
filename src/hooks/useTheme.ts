import { useState, useEffect } from 'react'
import type { ThemeVariant } from '@/config/theme'
import { THEMES } from '@/config/theme'

const THEME_STORAGE_KEY = 'symphony-theme'

/**
 * Get the initial theme from localStorage or default to 'nordic'
 */
function getInitialTheme(): ThemeVariant {
  if (typeof window === 'undefined') return 'nordic'

  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'nordic' || stored === 'kinetic') {
    return stored
  }

  return 'nordic' // Default to Nordic Journal
}

/**
 * Hook to manage theme selection with localStorage persistence
 * Dynamically loads and unloads CSS files when theme changes
 */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeVariant>(getInitialTheme)
  const [isLoading, setIsLoading] = useState(false)

  // Load CSS for the current theme
  useEffect(() => {
    const loadThemeCSS = async () => {
      setIsLoading(true)

      // Remove existing theme stylesheets
      const existingLinks = document.querySelectorAll('link[data-theme-css]')
      existingLinks.forEach(link => link.remove())

      // Load the appropriate CSS file
      try {
        if (theme === 'kinetic') {
          await import('@/kinetic-clarity.css')
        } else {
          await import('@/index.css')
        }
      } catch (err) {
        console.error('Failed to load theme CSS:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadThemeCSS()
  }, [theme])

  const setTheme = (newTheme: ThemeVariant) => {
    localStorage.setItem(THEME_STORAGE_KEY, newTheme)
    setThemeState(newTheme)

    // Force a full page reload to cleanly switch themes
    // This ensures all CSS is properly loaded/unloaded
    window.location.reload()
  }

  return {
    theme,
    setTheme,
    isLoading,
    themes: THEMES,
  }
}
