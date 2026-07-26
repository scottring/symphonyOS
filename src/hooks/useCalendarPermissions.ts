import { useCallback, useEffect, useRef, useState } from 'react'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'

/**
 * Which Google calendars refuse writes.
 *
 * `CalendarEvent` carries no permission field — `accessRole` lives only on the
 * calendar LIST (`GoogleCalendarInfo`), reachable through `fetchCalendarList()`,
 * which is a promise-returning function with no cached state. Today's drag needs
 * it so a read-only event refuses the gesture visibly rather than accepting it,
 * failing at Google, and springing back for no visible reason. Scott's work
 * calendar is a read-only share, so this is a live case, not a hypothetical.
 *
 * Fetched once per mount and cached. An unknown calendar is treated as
 * WRITABLE on purpose: refusing on incomplete knowledge shows the user a
 * refusal they cannot explain, which is a worse failure than letting Google
 * reject the write.
 */
export function useCalendarPermissions(): {
  isReadOnlyCalendar: (calendarId?: string | null) => boolean
} {
  const { isConnected, fetchCalendarList } = useGoogleCalendar()
  const [readOnly, setReadOnly] = useState<Set<string>>(() => new Set())
  const fetched = useRef(false)

  useEffect(() => {
    if (!isConnected || fetched.current) return
    fetched.current = true
    let cancelled = false
    fetchCalendarList()
      .then((calendars) => {
        if (cancelled) return
        setReadOnly(new Set(
          calendars.filter((c) => c.accessRole === 'reader').map((c) => c.id),
        ))
      })
      .catch(() => {
        // Offline, or the scope was revoked. Staying empty means "everything is
        // writable", which is the deliberate default described above.
      })
    return () => { cancelled = true }
  }, [isConnected, fetchCalendarList])

  const isReadOnlyCalendar = useCallback(
    (calendarId?: string | null) => (calendarId ? readOnly.has(calendarId) : false),
    [readOnly],
  )

  return { isReadOnlyCalendar }
}
