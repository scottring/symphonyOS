// src/lib/planning/clockText.ts
//
// A time typed the way a person says it — "6pm", "6:30", "18:00",
// "6-9:15pm" — read into a start and an optional length.
//
// The timing menu used a native time field, which in the desktop app's
// WebKit view shows a made-up "12:30 PM" and holds no value until hour,
// minute and AM/PM are all filled in, so a time could not be saved from the
// detail pane at all (Scott, 2026-10-30). It also had no end: "6–9:15pm"
// could not be said. One text field reads both, and the menu states what it
// understood ("Set 6:00 – 9:15 PM") before anything is written.

import type { Task } from '@/types/task'

export interface ClockText {
  hours: number
  minutes: number
  /** Minutes from start to end, when a range was typed. */
  duration?: number
}

type Meridiem = 'am' | 'pm' | null

interface Side { h: number; m: number; mer: Meridiem }

function readSide(raw: string): Side | null {
  const s = raw.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, '')
  if (s === 'noon') return { h: 12, m: 0, mer: 'pm' }
  if (s === 'midnight') return { h: 12, m: 0, mer: 'am' }
  const match = /^(\d{1,2})(?::?(\d{2}))?(am?|pm?)?$/.exec(s)
  if (!match) return null
  const h = Number(match[1])
  const m = match[2] ? Number(match[2]) : 0
  const mer: Meridiem = match[3] ? (match[3].startsWith('a') ? 'am' : 'pm') : null
  if (m > 59 || h > 23 || (mer && (h < 1 || h > 12))) return null
  return { h, m, mer }
}

/** Minutes after midnight for a 12-hour reading of `side`. */
function at(side: Side, mer: 'am' | 'pm'): number {
  const h = (side.h % 12) + (mer === 'pm' ? 12 : 0)
  return h * 60 + side.m
}

/** A bare hour with nothing to go on: daytime hours read as the household
 *  uses them — 7 to 11 in the morning, 12 to 6 in the afternoon or evening.
 *  The menu shows the reading before it saves, so a wrong guess is seen. */
function guess(side: Side): number {
  if (side.h === 0 || side.h > 12) return side.h * 60 + side.m
  return at(side, side.h >= 7 && side.h <= 11 ? 'am' : 'pm')
}

export function parseClockText(text: string): ClockText | null {
  const parts = text.trim().split(/\s*(?:-|–|—|\bto\b|\buntil\b|\btil\b)\s*/i)
  if (parts.length === 0 || parts.length > 2 || !parts[0]) return null
  const start = readSide(parts[0])
  if (!start) return null
  if (parts.length === 1) {
    const mins = start.mer ? at(start, start.mer) : guess(start)
    return { hours: Math.floor(mins / 60), minutes: mins % 60 }
  }
  const end = parts[1] ? readSide(parts[1]) : null
  if (!end) return null

  let a: number
  let b: number
  const twentyFour = (s: Side) => !s.mer && (s.h === 0 || s.h > 12)
  if (start.mer || twentyFour(start)) {
    a = start.mer ? at(start, start.mer) : start.h * 60 + start.m
    // An end with no meridiem is the first such time after the start.
    b = end.mer ? at(end, end.mer) : twentyFour(end) ? end.h * 60 + end.m : nextAfter(end, a)
  } else if (end.mer || twentyFour(end)) {
    b = end.mer ? at(end, end.mer) : end.h * 60 + end.m
    // "6-9:15pm" is 6 PM, "10-1pm" is 10 AM: the reading that makes the
    // shorter span.
    const span = (x: number) => (b - x + 24 * 60) % (24 * 60) || 24 * 60
    const am = at(start, 'am')
    const pm = at(start, 'pm')
    a = span(am) <= span(pm) ? am : pm
  } else {
    a = guess(start)
    b = nextAfter(end, a)
  }
  let duration = b - a
  if (duration <= 0) duration += 24 * 60
  return { hours: Math.floor(a / 60), minutes: a % 60, duration }
}

/** A start and an optional end, typed in two fields. The end is read as the
 *  first such time after the start ("6pm" to "9:15" is 9:15 PM). */
export function parseStartEnd(start: string, end: string): ClockText | null {
  if (!end.trim()) return parseClockText(start)
  if (!start.trim() || /-|–|—|\bto\b/i.test(start)) return null
  return parseClockText(`${start} - ${end}`)
}

/** The first 12-hour reading of `side` that comes after `after`. */
function nextAfter(side: Side, after: number): number {
  const am = at(side, 'am')
  const pm = at(side, 'pm')
  if (am > after) return am
  if (pm > after) return pm
  return am
}

export const clock = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

/** "6:00 PM", or "6:00 – 9:15 PM" for a range — what a timed row says, and
 *  what the time field starts out holding. */
export function clockLabel(start: Date, duration?: number | null): string {
  if (!duration) return clock(start)
  const end = new Date(start.getTime() + duration * 60_000)
  const a = clock(start)
  const b = clock(end)
  const sameHalf = (start.getHours() < 12) === (end.getHours() < 12)
  return `${sameHalf ? a.replace(/\s?[AP]M$/, '') : a} – ${b}`
}

/** The write for a time on `day`, or for "any time that day" (null). A range
 *  ("6–9:15pm") is the task's length; a single time has none, since the field
 *  showed any length it had and it was typed away. Shared by the detail pane, Today and Week. */
export function timeOnDay(day: Date, time: ClockText | null): Partial<Task> {
  const at = new Date(day)
  at.setHours(time?.hours ?? 0, time?.minutes ?? 0, 0, 0)
  return {
    bucket: 'timed', scheduledFor: at, isAllDay: !time,
    ...(time ? { estimatedDuration: time.duration } : {}),
  }
}
