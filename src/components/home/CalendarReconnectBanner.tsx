import { AlertTriangle, CalendarDays } from 'lucide-react'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'

/**
 * The calendar's state, said on the planning surfaces (Today and Week).
 *
 * Five states, four of them visible (walkthrough + review, 2026-09-20 — a
 * new account opened on an empty Today with no hint that events existed, and
 * a connected-but-empty day looked identical to a disconnected one):
 *
 *   no connection        quiet line + Connect — events give the day its shape
 *   loading              nothing (no flash during the startup validation)
 *   expired / revoked    the amber alert + Reconnect (unchanged)
 *   sync failure         amber line + Retry; "connected" never means "synced"
 *   healthy              nothing here — the day's own empty copy says
 *                        "your calendar is clear" (TodayView)
 *
 * Persistent on purpose (no dismiss), so an empty state can't be hidden and
 * forgotten. The file keeps its old name because the mount does.
 */
export function CalendarReconnectBanner() {
  const { isConnected, needsReconnect, isLoading, error, connect, fetchWeekEvents } = useGoogleCalendar()

  if (isLoading) return null

  if (needsReconnect) {
    return (
      <div role="alert" className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
        </span>
        <p className="flex-1 text-sm text-amber-900">
          Google Calendar disconnected — your events aren’t showing.
        </p>
        <button type="button" onClick={() => void connect()}
          className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-700">
          Reconnect
        </button>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div role="status" className="mb-4 flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white">
          <CalendarDays className="h-4 w-4 text-neutral-500" aria-hidden="true" />
        </span>
        <p className="flex-1 text-sm text-neutral-700">
          No calendar connected. Your events give the day its shape.
        </p>
        <button type="button" onClick={() => void connect()}
          className="shrink-0 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700">
          Connect Google Calendar
        </button>
      </div>
    )
  }

  if (error) {
    return (
      <div role="alert" className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
        </span>
        <p className="flex-1 text-sm text-amber-900">
          Calendar didn’t sync — {error}
        </p>
        <button type="button" onClick={() => void fetchWeekEvents()}
          className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-700">
          Retry
        </button>
      </div>
    )
  }

  return null
}

export { CalendarReconnectBanner as CalendarStatus }
