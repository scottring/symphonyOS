// Back, inside Symphony itself (Scott, 2026-10-24: "we could really use a
// global back button"). Installed to the home screen, Symphony runs without
// the browser's own controls, so there was no way back at all.

import { ChevronLeft } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

/** True once this visit has gone somewhere inside Symphony. BrowserRouter
 *  numbers its history entries; 0 is where the visit began, so Back never
 *  leaves the app (or lands on a page before it). */
export function useCanGoBack(): boolean {
  const location = useLocation()
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
  return location.key !== 'default' && idx > 0
}

/** Desktop: always in the bar, quiet until there is somewhere to go back to. */
export function BackButton({ className = '' }: { className?: string }) {
  const navigate = useNavigate()
  const can = useCanGoBack()
  return <button type="button" className={`page-navigation-icon page-navigation-back ${className}`.trim()} aria-label="Back" title="Back"
    aria-disabled={!can || undefined} onClick={() => { if (can) navigate(-1) }}>
    <ChevronLeft size={19} aria-hidden="true" />
  </button>
}

/** Phone: a Back line above pages reached from somewhere else. The tab roots
 *  (Home, Today, Plan) have none, as in any iPhone app. */
export function PhoneBack({ isRoot }: { isRoot: boolean }) {
  const navigate = useNavigate()
  const can = useCanGoBack()
  if (!can || isRoot) return null
  return <button type="button" className="phone-back" onClick={() => navigate(-1)}>
    <ChevronLeft size={20} aria-hidden="true" />Back
  </button>
}
