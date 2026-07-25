// src/lib/planning/timeAxis.ts
//
// Proportional-time maths shared by every horizon rung.
//
// The organizing rule of the cascade is that a rung draws the unit it places
// into and nothing finer — year draws seasons, season draws months, month
// draws weeks, week draws days. What every one of those drawings needs is the
// same four answers: where does a date sit along this span, which calendar
// claims eat more than a day of it, how full is each week, and where do the
// month and season boundaries fall.
//
// Pure. No React, no ambient clock — callers pass `now`, which is what lets
// the tests pin a date instead of mocking time.
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const DAY_MS = 86_400_000

/** Where `d` sits in [start, end] as 0..1, clamped at both ends. */
export function fractionOfSpan(d: Date, start: Date, end: Date): number {
  const total = end.getTime() - start.getTime()
  if (total <= 0) return 0
  const f = (d.getTime() - start.getTime()) / total
  return f < 0 ? 0 : f > 1 ? 1 : f
}

/** The same, formatted for a CSS `left`/`width`. */
export function spanPercent(d: Date, start: Date, end: Date): string {
  return `${(fractionOfSpan(d, start, end) * 100).toFixed(1)}%`
}

export interface MultiDayClaim {
  id: string
  title: string
  start: Date
  end: Date
  startPct: number
  widthPct: number
}

function eventStart(e: CalendarEvent): Date | null {
  const raw = e.startTime ?? e.start_time
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function eventEnd(e: CalendarEvent): Date | null {
  const raw = e.endTime ?? e.end_time
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

// A "claim" is a calendar event that eats >= minDays of the span: a trip, a
// camp, an on-call week. Single appointments are noise at year and season
// altitude — they're counted by weekBuckets instead, where they read as
// density rather than as named things.
export function multiDayClaims(
  events: readonly CalendarEvent[],
  start: Date,
  end: Date,
  minDays = 2,
): MultiDayClaim[] {
  const out: MultiDayClaim[] = []
  for (const e of events) {
    const s = eventStart(e)
    const en = eventEnd(e)
    if (!s || !en) continue
    const days = Math.round((en.getTime() - s.getTime()) / DAY_MS)
    if (days < minDays) continue
    if (en < start || s > end) continue
    const startPct = fractionOfSpan(s, start, end) * 100
    const endPct = fractionOfSpan(en, start, end) * 100
    out.push({
      id: e.id,
      title: e.title ?? 'Untitled',
      start: s,
      end: en,
      startPct,
      // A one-pixel bar is invisible; floor the width so a short trip still
      // reads as a bar rather than a hairline.
      widthPct: Math.max(0.4, endPct - startPct),
    })
  }
  return out.sort((a, b) => a.startPct - b.startPct)
}

export interface WeekBucket {
  weekStart: Date
  count: number
}

// One bucket per week of the span, always contiguous. An empty tail must come
// back as zeroes rather than as absent buckets — otherwise the density strip
// silently shortens and the unwritten end of the year stops reading as runway,
// which is the single most useful thing the year rung has to say.
export function weekBuckets(dates: readonly Date[], start: Date, end: Date): WeekBucket[] {
  const first = new Date(start)
  first.setHours(0, 0, 0, 0)
  first.setDate(first.getDate() - first.getDay())
  const buckets: WeekBucket[] = []
  for (const t = new Date(first); t <= end; t.setDate(t.getDate() + 7)) {
    buckets.push({ weekStart: new Date(t), count: 0 })
  }
  for (const d of dates) {
    const idx = Math.floor((d.getTime() - first.getTime()) / (7 * DAY_MS))
    if (idx >= 0 && idx < buckets.length) buckets[idx].count += 1
  }
  return buckets
}

const MONTH_TICK_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** Twelve tick positions along a calendar year, as percentages. */
export function monthTicks(year: number): { label: string; pct: number }[] {
  const start = new Date(year, 0, 1)
  const end = new Date(year, 11, 31, 23, 59, 59)
  return MONTH_TICK_LABELS.map((label, m) => ({
    label,
    pct: fractionOfSpan(new Date(year, m, 1), start, end) * 100,
  }))
}

const SEASON_LABELS = ['Winter', 'Spring', 'Summer', 'Autumn']

/** Four segments covering the year, matching the season rung's quarters. */
export function seasonSegments(year: number): { label: string; startPct: number; widthPct: number; index: number }[] {
  const start = new Date(year, 0, 1)
  const end = new Date(year, 11, 31, 23, 59, 59)
  return SEASON_LABELS.map((label, i) => {
    const segStart = fractionOfSpan(new Date(year, i * 3, 1), start, end) * 100
    const segEnd = i === 3 ? 100 : fractionOfSpan(new Date(year, (i + 1) * 3, 1), start, end) * 100
    return { label, index: i, startPct: segStart, widthPct: segEnd - segStart }
  })
}
