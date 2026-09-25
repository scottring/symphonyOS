import { useEffect, useReducer } from 'react'
import { supabase } from '@/lib/supabase'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { getCurrentAccount, onAccountChanged } from '@/lib/currentAccount'
import { onCalendarChanged } from '@/lib/calendarChangedSignal'

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
/**
 * Which read is the newest one STARTED. A response from an older read must
 * never overwrite a newer one's data: an account change or a write landing
 * mid-flight puts two requests in the air, and the network decides which
 * answers first (Codex, 2026-09-25).
 */
let generation = 0
/** The generation currently in flight, so its own `finally` can identify it. */
let inflightGen = 0
/**
 * How many times the world has been declared changed. A read started before
 * the latest change describes the world before it, so when such a read lands
 * it is kept (better than nothing) and immediately followed by a fresh one.
 * A mutation arriving during a request must not simply be discarded.
 */
let changeSeq = 0

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
  generation = 0
  inflightGen = 0
  changeSeq = 0
  unwireSignals()
  wiredCount = 0
}

const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

/** The window to read for, and the key that identifies it. */
export function dayLoadWindow(accountId: string | null, now: Date = new Date()): { key: string; range: DayLoadRange } {
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - DAY_LOAD_BACK_DAYS)
  const end = new Date(now); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() + DAY_LOAD_RANGE_DAYS)
  return { key: `${accountId ?? 'anon'}|${ymd(start)}|${ymd(end)}`, range: { start: start.getTime(), end: end.getTime() } }
}

/** Start a read. Callers have already decided that one is wanted. */
function start(accountId: string | null): void {
  const { key, range } = dayLoadWindow(accountId)
  const gen = ++generation
  const seq = changeSeq
  inflightKey = key
  inflightGen = gen
  void (async () => {
    let outcome: 'ok' | 'failed' = 'failed'
    let events: CalendarEvent[] = []
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
      events = (data?.events ?? []) as CalendarEvent[]
      outcome = 'ok'
    } catch {
      outcome = 'failed'
    }

    // An older response has nothing to say about the world any more.
    const newest = gen === generation
    if (newest) {
      if (outcome === 'ok') {
        read = { key, range, events }
        if (failedKey === key) { failedKey = null; failedAt = 0 }
      } else {
        // A failed fetch must NOT read as "these days are free".
        failedKey = key
        failedAt = Date.now()
        if (read?.key === key) read = null
      }
    }

    if (inflightGen === gen) { inflightKey = null; inflightGen = 0 }

    // Something changed while this was in the air: what just landed predates
    // it, so read again rather than leaving the tiles on a stale count.
    const stale = newest && changeSeq > seq && inflightKey === null
    if (stale) start(getCurrentAccount())
    notify()
  })()
}

/**
 * Read the window if it is not already held, already in flight, or recently
 * failed. The MOUNT path: cheap, deduped, and respectful of the cooldown.
 */
function ensure(accountId: string | null): void {
  const { key } = dayLoadWindow(accountId)
  if (read?.key === key) return
  if (inflightKey === key) return
  if (failedKey === key && Date.now() - failedAt < DAY_LOAD_RETRY_AFTER_MS) return
  start(accountId)
}

/**
 * The world changed — we wrote to the calendar, or the tab came back and the
 * day may have rolled over. ONE read follows, however many consumers are
 * mounted: this is called once per signal, from the module's own single
 * subscription, not once per hook.
 *
 * Deliberately clears the failure cooldown. A forced read is caused by the
 * user, not by a timer, so it is not the polling the cooldown exists to
 * prevent — and refusing to retry after the user just fixed their calendar
 * connection would be the wrong answer.
 */
function invalidate(): void {
  changeSeq++
  const account = getCurrentAccount()
  const { key } = dayLoadWindow(account)
  if (failedKey === key) { failedKey = null; failedAt = 0 }
  // Already reading: that request either postdates this change (nothing to
  // do) or predates it, in which case its own completion starts the re-read.
  if (inflightKey !== null) return
  read = null
  start(account)
}

// ── The module's own subscriptions ──────────────────────────────────────────
//
// One per tab, ref-counted by mounted consumers — NOT one per consumer. Three
// open pickers sharing a cache must make one read when a signal fires, and
// before this each of them started its own (Codex, 2026-09-25).

/** How long after a foreground return before another one counts. */
const VISIBILITY_THROTTLE_MS = 30_000

let wiredCount = 0
let teardown: Array<() => void> = []
let lastVisibleAt = 0

function wireSignals(): void {
  const onVisible = () => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return
    const now = Date.now()
    if (now - lastVisibleAt < VISIBILITY_THROTTLE_MS) return
    lastVisibleAt = now
    invalidate()
  }
  lastVisibleAt = Date.now()
  teardown.push(onCalendarChanged(() => invalidate()))
  teardown.push(onAccountChanged(() => {
    // The read held belongs to the previous account; it must not be shown.
    read = null
    failedKey = null
    changeSeq++
    generation++                       // orphan anything in flight for the old account
    inflightKey = null
    inflightGen = 0
    notify()
    start(getCurrentAccount())
  }))
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible)
    teardown.push(() => document.removeEventListener('visibilitychange', onVisible))
  }
}

function unwireSignals(): void {
  for (const off of teardown) off()
  teardown = []
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

  // The signals are the MODULE's, ref-counted here. A consumer subscribing on
  // its own account meant one calendar write started as many reads as there
  // were open pickers.
  useEffect(() => {
    if (!enabled) return
    if (wiredCount++ === 0) wireSignals()
    return () => { if (--wiredCount === 0) unwireSignals() }
  }, [enabled])

  const { key } = dayLoadWindow(accountId)
  useEffect(() => {
    if (!enabled) return
    ensure(accountId)
  }, [enabled, accountId, key])

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
