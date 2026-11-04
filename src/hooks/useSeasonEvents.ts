// The calendar for the season being planned (Season session, step 3). The
// planning day tiles' read (useDayLoadEvents) reaches about 45 days ahead; a
// season runs about 90, so the season's calendar reads its own range once:
// from today (or the season's first day, if later) to the season's end. Kept
// per account and season for the tab; a read that failed is not kept, so the
// next time the step opens it tries again. Only read while enabled (the step
// is on screen) and someone is signed in.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { getCurrentAccount, onAccountChanged } from '@/lib/currentAccount'

export interface SeasonEvents {
  events: CalendarEvent[]
  available: boolean
  loading: boolean
  failed: boolean
  /** What was actually read, in ms (end exclusive); null until a read lands. */
  range: { start: number; end: number } | null
}

interface Read { events: CalendarEvent[]; range: { start: number; end: number } }
const held = new Map<string, Read>()
const inflight = new Map<string, Promise<Read | null>>()

/** Test-only. */
export function __resetSeasonEvents(): void { held.clear(); inflight.clear() }

function load(key: string, start: number, end: number): Promise<Read | null> {
  const running = inflight.get(key)
  if (running) return running
  const p = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar-events', {
        body: { startDate: new Date(start).toISOString(), endDate: new Date(end).toISOString(), domain: 'universal' },
      })
      if (error || data?.error) return null
      const r: Read = { events: (data?.events ?? []) as CalendarEvent[], range: { start, end } }
      held.set(key, r)
      return r
    } catch {
      return null
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, p)
  return p
}

export function useSeasonEvents(seasonStart: Date, seasonEnd: Date, enabled: boolean): SeasonEvents {
  const [account, setAccount] = useState(getCurrentAccount)
  useEffect(() => onAccountChanged(setAccount), [])
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const start = Math.max(today, seasonStart.getTime()), end = seasonEnd.getTime()
  // A period already over has nothing left to read (from today it would ask
  // for start > end): no request, and an empty read of nothing.
  const over = start >= end
  const key = enabled && account && !over ? `${account}|${start}|${end}` : null
  const [done, setDone] = useState<{ key: string; read: Read | null } | null>(null)

  useEffect(() => {
    if (!key || held.has(key)) return
    let live = true
    void load(key, start, end).then((read) => { if (live) setDone({ key, read }) })
    return () => { live = false }
  }, [key, start, end])

  if (over && enabled && account) return { events: [], available: true, loading: false, failed: false, range: { start: end, end } }
  const read = key ? held.get(key) ?? (done?.key === key ? done.read : null) : null
  const failed = !!key && !read && done?.key === key && done.read === null
  return { events: read?.events ?? [], available: !!read, loading: !!key && !read && !failed, failed, range: read?.range ?? null }
}
