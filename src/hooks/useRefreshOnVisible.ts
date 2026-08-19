import { useEffect, useRef } from 'react'

interface RefreshOnVisibleOptions {
  /**
   * Minimum gap between refreshes. Alt-tabbing fires visibility/focus events in
   * bursts; without a floor every bounce would re-hit the Google Calendar API
   * (and the egress bill — see the wall-polling incident).
   */
  minIntervalMs?: number
  /** Skip entirely when there's nothing to refresh (e.g. calendar not connected). */
  enabled?: boolean
}

const DEFAULT_MIN_INTERVAL_MS = 60_000

/**
 * Run `onRefresh` when the user returns to a tab that's been sitting open.
 *
 * Why this exists: Today fetches Google Calendar events once per mount and has
 * no polling or realtime channel, so an event created in Google *after* the tab
 * loaded stayed invisible until a manual reload. A tab open all day silently
 * drifted further from reality as the day went on.
 *
 * Listens to BOTH `visibilitychange` and window `focus` on purpose: switching
 * Chrome tabs fires visibilitychange, but switching to another app and back
 * often only fires focus. The throttle makes the overlap harmless.
 *
 * Deliberately does NOT fire on mount — callers already fetch once themselves.
 */
export function useRefreshOnVisible(
  onRefresh: () => void,
  { minIntervalMs = DEFAULT_MIN_INTERVAL_MS, enabled = true }: RefreshOnVisibleOptions = {},
) {
  const callbackRef = useRef(onRefresh)
  const lastRunRef = useRef(0)

  useEffect(() => {
    callbackRef.current = onRefresh
  }, [onRefresh])

  // Seed with mount time so an immediate focus right after load doesn't
  // duplicate the caller's own initial fetch. Done in an effect rather than
  // useRef's initializer — Date.now() is impure and must not run during render.
  useEffect(() => {
    lastRunRef.current = Date.now()
  }, [])

  useEffect(() => {
    if (!enabled) return

    const maybeRefresh = () => {
      if (document.hidden) return
      const now = Date.now()
      if (now - lastRunRef.current < minIntervalMs) return
      lastRunRef.current = now
      callbackRef.current()
    }

    document.addEventListener('visibilitychange', maybeRefresh)
    window.addEventListener('focus', maybeRefresh)
    return () => {
      document.removeEventListener('visibilitychange', maybeRefresh)
      window.removeEventListener('focus', maybeRefresh)
    }
  }, [enabled, minIntervalMs])
}
