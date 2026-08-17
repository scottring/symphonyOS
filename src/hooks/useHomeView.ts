import type { HomeViewType } from '@/types/homeView'

interface UseHomeViewResult {
  currentView: HomeViewType
  setCurrentView: (view: HomeViewType) => void
}

const noop = () => {}

// Pinned to 'today' since the 2026-08 analog-planning pivot: the D/W/M
// sub-views were de-navved along with the horizon ladder. Pinning here (the
// single source of the sub-view state, previously localStorage-backed) makes
// Week/Month unreachable from every entry point — switcher, sidebar, stale
// localStorage, cross-tab storage events — without touching their components.
export function useHomeView(): UseHomeViewResult {
  return {
    currentView: 'today',
    setCurrentView: noop,
  }
}
