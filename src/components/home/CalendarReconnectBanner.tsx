import { AlertTriangle } from 'lucide-react'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'

/**
 * Surfaces an otherwise-silent calendar-disconnected state.
 *
 * When the stored Google token expires or is revoked, the calendar hook sets
 * needsReconnect and stops loading events — every view (Today/Week/Month) then
 * goes silently empty. This banner makes that state visible and offers a
 * one-click reconnect. It is intentionally persistent (no dismiss) so the empty
 * state can't be hidden and forgotten.
 *
 * Renders nothing unless the token actually needs reconnecting. The isLoading
 * guard suppresses a flash during the startup token-validation call.
 */
export function CalendarReconnectBanner() {
  const { needsReconnect, isLoading, connect } = useGoogleCalendar()

  if (!needsReconnect || isLoading) return null

  return (
    <div
      role="alert"
      className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
        <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
      </span>
      <p className="flex-1 text-sm text-amber-900">
        Google Calendar disconnected — your events aren’t showing.
      </p>
      <button
        type="button"
        onClick={() => void connect()}
        className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-700"
      >
        Reconnect
      </button>
    </div>
  )
}
