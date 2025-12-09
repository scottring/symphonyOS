import { useState, useCallback, useEffect } from 'react'
import type { HomeViewType } from '@/types/homeView'

const STORAGE_KEY = 'symphony-home-view'

interface UseHomeViewResult {
  currentView: HomeViewType
  setCurrentView: (view: HomeViewType) => void
}

export function useHomeView(): UseHomeViewResult {
  // Initialize from localStorage
  const [currentView, setCurrentViewState] = useState<HomeViewType>(() => {
    if (typeof window === 'undefined') return 'today'
    const stored = localStorage.getItem(STORAGE_KEY)
    // Migrate old 'today-context' to 'today'
    if (stored === 'today' || stored === 'today-context') {
      return 'today'
    }
    if (stored === 'week') {
      return 'week'
    }
    if (stored === 'review') {
      return 'review'
    }
    return 'today'
  })

  // Persist view preference
  const setCurrentView = useCallback((view: HomeViewType) => {
    setCurrentViewState(view)
    localStorage.setItem(STORAGE_KEY, view)
  }, [])

  // Sync with localStorage on mount (in case another tab changed it)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        if (e.newValue === 'today' || e.newValue === 'week' || e.newValue === 'review') {
          setCurrentViewState(e.newValue)
        }
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  return {
    currentView,
    setCurrentView,
  }
}
