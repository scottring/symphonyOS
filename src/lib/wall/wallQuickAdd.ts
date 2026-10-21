// What the wall's quick add saves from a parsed capture. PURE.
//
// The capture sheet shows the day it parsed ("→ Sat, Oct 24") before you tap
// Add, so the saved task must land on that day — and the flash says it again.
// Repeats are not set from the wall; the task lands on the first day only.

import type { TaskCategory } from '@/types/task'
import type { RecurrencePattern } from '@/types/actionable'
import { dayLabel } from './wallDates'

export interface WallQuickAddData {
  title: string
  scheduledFor?: Date
  isAllDay?: boolean
  category?: TaskCategory
  assignedMemberIds?: string[]
  recurrence?: RecurrencePattern
}

const clock = (d: Date) => `${d.getHours() % 12 === 0 ? 12 : d.getHours() % 12}:${String(d.getMinutes()).padStart(2, '0')}`

export function wallQuickAdd(data: WallQuickAddData, now: Date) {
  const when = data.scheduledFor
  const allDay = data.isAllDay !== false
  const ids = data.assignedMemberIds ?? []
  const day = when ? (allDay ? dayLabel(when, now) : `${dayLabel(when, now)} at ${clock(when)}`) : null
  const title = data.title.length > 40 ? `${data.title.slice(0, 40)}…` : data.title
  return {
    title: data.title,
    when,
    options: {
      context: 'family' as const,
      ...(when ? { isAllDay: allDay } : {}),
      ...(data.category ? { category: data.category } : {}),
      ...(ids.length ? { assignedTo: ids[0], assignedToAll: ids } : {}),
    },
    flash: `Added: ${title} · ${day ? (data.recurrence ? `${day} only (set repeats in the app)` : day) : 'no day yet'}`,
  }
}
