import type { GoogleCalendarInfo } from '@/hooks/useGoogleCalendar'

interface CalendarVisibilityListProps {
  calendars: GoogleCalendarInfo[]
  /** Calendar IDs currently hidden from Symphony. */
  hiddenIds: Set<string>
  /** Toggle a calendar's visibility. hidden=true removes it from every Symphony view. */
  onSetHidden: (calendarId: string, hidden: boolean) => void
}

/**
 * Per-calendar on/off list. "Off" hides a calendar's events everywhere in
 * Symphony without touching Google — the only way to clear read-only calendars
 * (Holidays, subscriptions, shared mirrors) you can't delete events from.
 */
export function CalendarVisibilityList({ calendars, hiddenIds, onSetHidden }: CalendarVisibilityListProps) {
  return (
    <ul className="divide-y divide-neutral-100">
      {calendars.map((cal) => {
        const hidden = hiddenIds.has(cal.id)
        const readOnly = cal.accessRole === 'reader'
        return (
          <li key={cal.id} className="flex items-center gap-3 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-800 truncate">{cal.summary}</span>
                {readOnly && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-neutral-100 text-neutral-500">
                    Read-only
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!hidden}
              aria-label={`Show ${cal.summary} in Symphony`}
              onClick={() => onSetHidden(cal.id, !hidden)}
              className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                hidden ? 'bg-neutral-300' : 'bg-primary-600'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  hidden ? 'translate-x-0.5' : 'translate-x-[22px]'
                }`}
              />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
