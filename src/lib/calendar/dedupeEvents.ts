
/**
 * Collapse the same meeting appearing on more than one synced calendar.
 *
 * A household subscribes to several calendars that overlap — a shared family
 * calendar plus each person's own, an invitation that landed in two accounts —
 * and Google returns the event once per calendar. Every surface that renders
 * those events therefore sees genuine duplicates in its input.
 *
 * This logic has existed since TodaySchedule and was ported into
 * computeTodayData, where it quietly did its job — which is exactly why the
 * duplicates were invisible until `/week` rendered the same data without it
 * and showed every school day and every dinner twice, side by side in
 * overlapping lanes. Deduping per-surface guarantees the next surface forgets
 * again, so it now happens once, where events enter the app.
 *
 * Keyed on the PARSED INSTANT, not the raw string: the same meeting synced to
 * two calendars can report identical times in different forms — e.g.
 * "09:00:00-04:00" on the primary and "13:00:00Z" on a group calendar.
 *
 * Known and accepted tradeoff, inherited unchanged from the Today
 * implementation: two genuinely distinct events sharing both a title and a
 * start instant collapse into one. Tightening the key to an id doesn't help —
 * a calendar copy carries a different `google_event_id` — and title+instant
 * has held up in practice. First to render wins, so the caller controls which
 * copy survives by ordering its input.
 */
export function dedupeCalendarEvents<T extends {
  title: string
  start_time?: string | null
  startTime?: string | null
}>(events: T[]): T[] {
  const seen = new Set<string>()
  return events.filter((event) => {
    const start = event.start_time || event.startTime
    if (!start) return true
    const key = `${event.title}|${new Date(start).getTime()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
