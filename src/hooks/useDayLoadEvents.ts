import { useCallback, useEffect, useReducer } from 'react'
import { supabase } from '@/lib/supabase'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { getCurrentAccount, onAccountChanged } from '@/lib/currentAccount'
import { onCalendarChanged } from '@/lib/calendarChangedSignal'
import { useRefreshOnVisible } from '@/hooks/useRefreshOnVisible'

/** Far enough forward to cover every relative tile, including "this month". */
export const DAY_LOAD_RANGE_DAYS = 45

/**
 * And far enough BACK to cover the current week.
 *
 * The day tiles offer the days of a week, and on Today or the current month
 * that week normally begins before today. Reading only forward left those
 * days reported as "not read" — four blank tiles on a Thursday — while /week,
 * which fetches its own whole week, counted them. Seven days back covers any
 * week containing today, whichever day a household starts its week on.
 */
export const DAY_LOAD_BACK_DAYS = 7

/** How long a failed read stays failed before anything is allowed to try again. */
export const DAY_LOAD_RETRY_AFTER_MS = 60_000

export interface DayLoadRange { start: number; end: number }

export interface DayLoadEvents {
  events: CalendarEvent[]
  available: boolean
  loading: boolean
  /**
   * The range these events were ACTUALLY fetched for, in ms.
   *
   * The reason this is returned rather than recomputed by the reader: a cache
   * filled yesterday describes yesterday's window, and a reader that derived
   * coverage from today's clock would call a day covered that was never
   * fetched — the exact "confidently short count" this module exists to
   * prevent (Codex, 2026-09-25). Null when there is nothing held.
   */
  range: DayLoadRange | null
  /** The last attempt for this window failed; the count is short, not empty. */
  failed: boolean
}

// ── The shared read ─────────────────────────────────────────────────────────
//
// One cache for every consumer in the tab, keyed by WHO is asking and WHICH
// window. Everything below is module state on purpose — the scheduler opens
// often and the calendar does not change often — but it is keyed, subscribed
// to, and invalidated, none of which it was before:
//
//   KEYED BY ACCOUNT    a second account signing in the same tab must not be
//                       shown the first one's calendar.
//   KEYED BY WINDOW     the window is anchored on today. Past midnight the
//                       key changes and the old read stops matching, so a
//                       tab left open overnight re-reads instead of quietly
//                       reporting yesterday's coverage as today's.
//   SUBSCRIBED          every consumer is woken when a read lands, not just
//                       whichever one happened to start it — and the one that
//                       started it may well have unmounted by then (an open
//                       menu is closed before the answer arrives).
//   RECOVERABLE         a failure is remembered for ONE window and for one
//                       minute, not latched for the life of the tab.

interface Read {
  key: string
  range: DayLoadRange
  events: CalendarEvent[]
}

let read: Read | null = null
let failedKey: string | null = null
let failedAt = 0
let inflightKey: string | null = null
const subscribers = new Set<() => void>()

function notify(): void {
  for (const s of [...subscribers]) s()
}

/** Test-only: clear the module cache between cases. */
export function __resetDayLoadCache(): void {
  read = null
  failedKey = null
  failedAt = 0
  inflightKey = null
}

const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

/** The window to read for, and the key that identifies it. */
export function dayLoadWindow(accountId: string | null, now: Date = new Date()): { key: string; range: DayLoadRange } {
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - DAY_LOAD_BACK_DAYS)
  const end = new Date(now); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() + DAY_LOAD_RANGE_DAYS)
  return { key: `${accountId ?? 'anon'}|${ymd(start)}|${ymd(end)}`, range: { start: start.getTime(), end: end.getTime() } }
}

/**
 * Read the window if it is not already held, already in flight, or recently
 * failed. Returns nothing: every caller learns the outcome by subscription.
 */
function ensure(accountId: string | null, force = false): void {
  const { key, range } = dayLoadWindow(accountId)
  if (!force) {
    if (read?.key === key) return
    if (inflightKey === key) return
    if (failedKey === key && Date.now() - failedAt < DAY_LOAD_RETRY_AFTER_MS) return
  }
  inflightKey = key
  void (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar-events', {
        body: {
          startDate: new Date(range.start).toISOString(),
          endDate: new Date(range.end).toISOString(),
          // Density is universal by design: a day is full regardless of which
          // domain filled it, and regardless of whose it is. The tiles say so.
          domain: 'universal',
        },
      })
      if (error || data?.error) throw error ?? new Error(String(data.error))
      read = { key, range, events: (data?.events ?? []) as CalendarEvent[] }
      if (failedKey === key) { failedKey = null; failedAt = 0 }
    } catch {
      // A failed fetch must NOT read as "these days are free".
      failedKey = key
      failedAt = Date.now()
      if (read?.key === key) read = null
    } finally {
      if (inflightKey === key) inflightKey = null
      notify()
    }
  })()
}

/**
 * Calendar events for the fullness readout and the planning day tiles, in
 * their OWN cache.
 *
 * This deliberately does not read GoogleCalendarProvider. That provider's
 * fetchEvents REPLACES its state rather than merging into it
 * (`setEvents(data.events || [])`), and Today fetches only the viewed day — so
 * reading from it would see a single day of events and report every other day
 * as empty, which is exactly the lying-count failure the fullness bar exists to
 * avoid. Widening ITS fetch is worse: it would blank the events in the view
 * behind the open panel, the same failure HomeViewContainer already carries a
 * restore-hack for.
 *
 * So: one extra call, held here, touching nothing on screen. One per account
 * per day, plus a re-read when this tab writes to the calendar or comes back
 * to the foreground. Nothing polls.
 */
export function useDayLoadEvents(enabled: boolean): DayLoadEvents {
  const [, force] = useReducer((n: number) => n + 1, 0)
  const accountId = getCurrentAccount()

  // Every consumer is woken when a read lands — including consumers that did
  // not start it, which before this was nobody.
  useEffect(() => {
    subscribers.add(force)
    return () => { subscribers.delete(force) }
  }, [force])

  const { key } = dayLoadWindow(accountId)
  useEffect(() => {
    if (!enabled) return
    ensure(accountId)
  }, [enabled, accountId, key])

  // A different account signed in. The read held is the previous account's;
  // the key below stops matching, and this wakes every consumer to say so.
  useEffect(() => onAccountChanged(() => {
    if (read && read.key.split('|')[0] !== (getCurrentAccount() ?? 'anon')) read = null
    force()
  }), [force])

  // A write WE made. The view calendar refetches because the component that
  // wrote it owns the fetch; this cache has no owner, so it listens.
  useEffect(() => {
    if (!enabled) return
    return onCalendarChanged(() => ensure(accountId, true))
  }, [enabled, accountId])

  // Coming back to the tab: the day may have rolled over, the calendar may
  // have changed elsewhere, and a failed read deserves another chance.
  const onVisible = useCallback(async () => {
    if (!enabled) return
    ensure(accountId, true)
  }, [enabled, accountId])
  useRefreshOnVisible(onVisible, { enabled })

  const mine = read?.key === key ? read : null
  return {
    events: mine?.events ?? [],
    available: !!mine,
    // "Nothing yet, and not a failure" — true from the first render, before
    // the effect that starts the read has even run. A consumer that rendered
    // in the same tick as the one which started the request must not read as
    // settled-and-empty.
    loading: enabled && !mine && failedKey !== key,
    range: mine?.range ?? null,
    failed: !mine && failedKey === key,
  }
}
