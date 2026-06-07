// src/components/today/ComingUpPeek.tsx
//
// W4 — the quiet "coming up" sliver (Scott's "b"). A calm, glanceable row that
// answers "what's next" without leaving Today: the next dated days, how many sit
// in the week pool, and how many are still unsorted. Each pill is a doorway into
// the right horizon — never a wall of tasks.

import { CalendarDays, Layers, Inbox } from 'lucide-react'
import type { ComingUpSummary } from '@/lib/today/comingUp'

function dayLabel(date: Date, now: Date): string {
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  const tomorrow = new Date(now); tomorrow.setHours(0, 0, 0, 0); tomorrow.setDate(tomorrow.getDate() + 1)
  if (d.getTime() === tomorrow.getTime()) return 'Tomorrow'
  return d.toLocaleDateString(undefined, { weekday: 'short' })
}

interface ComingUpPeekProps {
  summary: ComingUpSummary
  now: Date
  onSelectDay: (date: Date) => void
  onOpenWeek: () => void
  onOpenInbox: () => void
  /** Cap on dated-day pills shown (keeps the sliver quiet). Default 3. */
  maxDays?: number
}

const pill =
  'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ' +
  'bg-neutral-50 text-neutral-600 hover:bg-neutral-100 transition-colors'

export function ComingUpPeek({
  summary, now, onSelectDay, onOpenWeek, onOpenInbox, maxDays = 3,
}: ComingUpPeekProps) {
  const { nextDays, weekCount, inboxCount } = summary
  const days = nextDays.slice(0, maxDays)

  // Nothing to peek at — stay silent rather than render an empty label.
  if (days.length === 0 && weekCount === 0 && inboxCount === 0) return null

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] uppercase tracking-wider text-neutral-400 mr-0.5">Coming up</span>

      {days.map((day) => (
        <button
          key={day.date.toISOString()}
          type="button"
          className={pill}
          onClick={() => onSelectDay(day.date)}
        >
          <CalendarDays className="w-3.5 h-3.5 text-neutral-400" />
          <span>{`${dayLabel(day.date, now)} · ${day.count}`}</span>
        </button>
      ))}

      {weekCount > 0 && (
        <button type="button" className={pill} onClick={onOpenWeek}>
          <Layers className="w-3.5 h-3.5 text-neutral-400" />
          <span>{`${weekCount} this week`}</span>
        </button>
      )}

      {inboxCount > 0 && (
        <button type="button" className={pill} onClick={onOpenInbox}>
          <Inbox className="w-3.5 h-3.5 text-neutral-400" />
          <span>{`${inboxCount} to sort`}</span>
        </button>
      )}
    </div>
  )
}
