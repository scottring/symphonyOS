// Two compact views of the week's days for planning in steps (Scott,
// 2026-10-03: "we can't just have one enormous list … present it stepwise"):
//
//   WeekStrip   beside each step: seven narrow days, each with its things and
//               its free time — the week filling up as you go.
//   WeekShape   the last step: each day's shape (what's taken between 7a and
//               9p, the free windows) and who carries each thing. Choosing a
//               person fades everyone else's things and shows THEIR free time.
//               No counts: between two peers a tally is a ledger.
import type { FamilyMember } from '@/types/family'
import { AssigneeAvatar } from '@/components/family/AssigneeAvatar'
import { journalTime } from '@/lib/week/journalSpread'
import { busyBlocks, freeWindows, formatFree, DAY_START, DAY_END } from '@/lib/week/dayShape'
import type { JournalDay, JournalEntry } from '@/lib/week/journalDays'
import { weekRhythm } from '@/lib/week/weekRhythm'

const weekday = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' })

/** Whose this is: a thing with no people (a calendar event) is everyone's. */
const carries = (e: JournalEntry, person: string) => person === 'all' || !e.people?.length || e.people.includes(person)

function dayFree(day: JournalDay, person: string, minGap?: number) {
  const timed = day.entries.filter((e) => e.time && !e.completed && carries(e, person))
  const busy = busyBlocks(timed.map((e) => ({ start: e.time!, end: e.end })))
  return { busy, text: formatFree(freeWindows(busy, minGap)) }
}

/** The week beside a planning step, by the Week page's rules (Scott,
 *  2026-10-04: "no hierarchy, same font for everything"): every-day routines
 *  left out, each thing marked by its kind, its time on its own small line,
 *  no counts, and free time (an hour or more) from today on. */
export function WeekStrip({ days, onSelectItem }: { days: JournalDay[]; onSelectItem: (id: string) => void }) {
  const shown = weekRhythm(days).days
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  return (
    <div className="wk-strip" role="list" aria-label="The week so far">
      {shown.map((day, i) => {
        const full = days[i]
        const items = [...day.entries, ...day.foldedRoutines]
        return (
          <section key={day.key} role="listitem" className={`wk-strip-day${day.date.getTime() === todayStart.getTime() ? ' is-today' : ''}`} data-testid={`strip-day-${day.key}`}
            aria-label={day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}>
            <header><span className="wk-strip-num">{day.date.getDate()}</span><span className="wk-strip-name">{weekday(day.date)}</span></header>
            {day.notes.length > 0 && <p className="wk-strip-note">{day.notes.map((n) => n.title).join(' · ')}</p>}
            <ul>
              {items.map((e) => (
                <li key={e.id} data-mark={e.kind} className={e.completed ? 'is-done' : undefined}>
                  <span className={`wk-strip-mark is-${e.kind}`} aria-hidden="true" />
                  <button type="button" onClick={() => onSelectItem(e.id)}>
                    {e.time && <span className="wk-strip-time">{journalTime(e.time)}</span>}
                    <span className="wk-strip-title">{e.title}</span>
                  </button>
                </li>
              ))}
            </ul>
            {full.date >= todayStart && <p className="wk-strip-free">{dayFree(full, 'all', 1).text}</p>}
          </section>
        )
      })}
    </div>
  )
}

export function WeekShape({ days, members, person = 'all', onSelectItem }: {
  days: JournalDay[]
  members: FamilyMember[]
  person?: string
  onSelectItem: (id: string) => void
}) {
  const byId = new Map(members.map((m) => [m.id, m]))
  const span = DAY_END - DAY_START
  return (
    <div className="wk-shape">
      {days.map((day) => {
        const { busy, text } = dayFree(day, person)
        const all = [...day.entries, ...day.foldedRoutines]
        return (
          <section key={day.key} className="wk-shape-day" data-testid={`shape-day-${day.key}`}
            aria-label={day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}>
            <header><span className="wk-strip-num">{day.date.getDate()}</span><span className="wk-strip-name">{weekday(day.date)}</span></header>
            {day.notes.length > 0 && <p className="wk-shape-note">{day.notes.map((n) => n.title).join(' · ')}</p>}
            <div className="wk-shape-track" aria-hidden="true">
              {busy.map((b, i) => <span key={i} style={{ left: `${((b.s - DAY_START) / span) * 100}%`, width: `${Math.max(1.5, ((b.e - b.s) / span) * 100)}%` }} />)}
            </div>
            <div className="wk-shape-ticks" aria-hidden="true"><span>7a</span><span>2p</span><span>9p</span></div>
            <p className="wk-shape-free">{text}</p>
            <ul>
              {all.map((e) => (
                <li key={e.id} className={`${carries(e, person) ? '' : 'is-dim'}${e.completed ? ' is-done' : ''}`.trim() || undefined}>
                  <span className="wk-shape-time">{e.time ? journalTime(e.time) : ''}</span>
                  <button type="button" onClick={() => onSelectItem(e.id)}>{e.title}</button>
                  <span className="wk-shape-people">
                    {(e.people ?? []).slice(0, 3).map((id) => { const m = byId.get(id); return m ? <AssigneeAvatar key={id} member={m} size="sm" /> : null })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
