// Planning the week, step 3 (spec 2026-11-01): the calendar check. The week's
// seven days with their fixed times, and what findClashes sees: two things at
// once, or a move to another place with under 15 minutes to get there. It
// only points; what changes is Scott's to say in the conversation.

import { AlertTriangle } from 'lucide-react'
import { findClashes, type ClashEvent } from '@/lib/guide/clashes'
import { localYmd } from '@/lib/cadence/config'

const time = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

export function CalendarCheck({ weekStart, events }: {
  weekStart: Date
  /** The week's timed events, as the page draws them (its space filter). */
  events: readonly ClashEvent[]
}) {
  const clashes = findClashes(events)
  const byId = new Map(events.map((e) => [e.id, e]))
  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i))
  const say = (c: (typeof clashes)[number]) => {
    const a = byId.get(c.a)!, b = byId.get(c.b)!
    if (c.kind === 'overlap') return `Overlap: ${a.title} and ${b.title}`
    const gap = Math.round((b.start.getTime() - a.end.getTime()) / 60_000)
    return `Tight: ${a.title}, then ${b.title} somewhere else ${gap === 0 ? 'right after' : `${gap} ${gap === 1 ? 'minute' : 'minutes'} later`}`
  }

  return <div className="gw-body">
    <p className="choose-was">{clashes.length === 0 ? 'No overlaps or tight moves.' : `${clashes.length} to look at`}</p>
    <ul className="gw-rows" aria-label="This week’s days">
      {days.map((d) => {
        const key = localYmd(d)
        const label = `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`
        const todays = events.filter((e) => localYmd(e.start) === key).sort((x, y) => x.start.getTime() - y.start.getTime())
        const flags = clashes.filter((c) => c.day === key)
        return <li key={key} className="gw-row gw-day" aria-label={label}>
          <span className="gw-day-label">{label}</span>
          {todays.length === 0 ? <span className="gw-row-note">Nothing fixed</span>
            : <ul className="gw-steps">{todays.map((e) => <li key={e.id}>
              <span className="gw-row-note">{time(e.start)}</span> <span className="gw-step-title">{e.title}</span>
              {e.place && <span className="gw-row-note"> · {e.place}</span>}
            </li>)}</ul>}
          {flags.map((c) => <p key={`${c.a}|${c.b}`} className="gw-flag"><AlertTriangle size={13} aria-hidden="true" /><span>{say(c)}</span></p>)}
        </li>
      })}
    </ul>
  </div>
}
