import { useState, useCallback, useEffect } from 'react'
import type { HomeViewType } from '@/types/homeView'

const STORAGE_KEY = 'symphony-home-view'
const SIDEBAR_STORAGE_KEY = 'symphony-context-sidebar-collapsed'

interface UseHomeViewResult {
  currentView: HomeViewType
  setCurrentView: (view: HomeViewType) => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
}

export function useHomeView(): UseHomeViewResult {
  // Initialize from localStorage
  const [currentView, setCurrentViewState] = useState<HomeViewType>(() => {
    if (typeof window === 'undefined') return 'today'
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'today' || stored === 'today-context' || stored === 'week') {
      return stored
    }
    return 'today'
  })

  const [sidebarCollapsed, setSidebarCollapsedState] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
  })

  // Persist view preference
  const setCurrentView = useCallback((view: HomeViewType) => {
    setCurrentViewState(view)
    localStorage.setItem(STORAGE_KEY, view)
  }, [])

  // Persist sidebar state
  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed)
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed))
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(!sidebarCollapsed)
  }, [sidebarCollapsed, setSidebarCollapsed])

  // Sync with localStorage on mount (in case another tab changed it)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        if (e.newValue === 'today' || e.newValue === 'today-context' || e.newValue === 'week') {
          setCurrentViewState(e.newValue)
        }
      }
      if (e.key === SIDEBAR_STORAGE_KEY) {
        setSidebarCollapsedState(e.newValue === 'true')
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  return {
    currentView,
    setCurrentView,
    sidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebar,
  }
}
