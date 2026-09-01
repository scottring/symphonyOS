//
// Meal + specials events leave the /week time grid (This Week redesign,
// 2026-09-01): "Dinner: …" events render in a per-day dinner row, and
// "Specials — …" fold into that day's School block subtitle. This module
// only partitions and labels; the view decides where each lands.
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

export interface ExtraEntry {
  event: CalendarEvent
  /** Title with the "Dinner:" / "Specials —" prefix stripped. */
  label: string
}

export interface WeekExtras {
  dinnersByDay: Map<string, ExtraEntry[]>
  specialsByDay: Map<string, ExtraEntry[]>
  /** Everything else, in input order — still grid material. */
  rest: CalendarEvent[]
}

const DINNER_RE = /^dinner\s*[—:–-]\s*/i
const SPECIALS_RE = /^specials\s*[—:–-]\s*/i

function eventStart(ev: CalendarEvent): Date | null {
  const raw =
    (ev as { start_time?: string }).start_time ??
    (ev as { startTime?: string }).startTime
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function dayKeyOf(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function partitionWeekExtras(events: CalendarEvent[]): WeekExtras {
  const dinnersByDay = new Map<string, ExtraEntry[]>()
  const specialsByDay = new Map<string, ExtraEntry[]>()
  const rest: CalendarEvent[] = []

  for (const event of events) {
    const title = event.title ?? ''
    const target = DINNER_RE.test(title)
      ? dinnersByDay
      : SPECIALS_RE.test(title)
      ? specialsByDay
      : null
    const start = target ? eventStart(event) : null
    if (!target || !start) {
      rest.push(event)
      continue
    }
    const re = target === dinnersByDay ? DINNER_RE : SPECIALS_RE
    const key = dayKeyOf(start)
    const list = target.get(key) ?? []
    list.push({ event, label: title.replace(re, '').trim() })
    target.set(key, list)
  }

  return { dinnersByDay, specialsByDay, rest }
}
