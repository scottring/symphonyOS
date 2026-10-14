// src/components/canvas/week/weekSentence.ts
//
// One plain sentence under the week's title (mockup "After 1"). Rules decide
// what it says (wall philosophy rule 5); nothing here is generated.

import type { CanvasDay } from './WeekCanvas'

const weekday = (d: CanvasDay) => d.date.toLocaleDateString('en-US', { weekday: 'long' })
const isWeekday = (d: CanvasDay) => d.date.getDay() >= 1 && d.date.getDay() <= 5
const openItems = (d: CanvasDay) => d.items.filter((i) => !i.completed && !i.proposed).length

export function weekSentence(days: CanvasDay[], todayKey: string): string | null {
  const parts: string[] = []
  const today = days.find((d) => d.key === todayKey)
  if (today?.events.length) parts.push(`Today: ${today.events[0].title}.`)
  const ahead = days.filter((d) => d.key > todayKey)
  const open = ahead.filter((d) => isWeekday(d) && !d.events.length && openItems(d) === 0)
  if (open.length === 1) parts.push(`${weekday(open[0])} is wide open.`)
  else if (open.length === 2) parts.push(`${weekday(open[0])} and ${weekday(open[1])} are wide open.`)
  else if (open.length > 2) parts.push(`${open.length} days ahead are wide open.`)
  const load = (d: CanvasDay) => d.events.length + openItems(d)
  const full = [...ahead].sort((a, b) => load(b) - load(a))[0]
  if (full && load(full) >= 4) parts.push(`${weekday(full)} is the full one.`)
  return parts.length ? parts.slice(0, 3).join(' ') : null
}
