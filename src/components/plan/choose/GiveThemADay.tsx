// Step 2 of planning a week: Give them a day (spec 2026-10-19). The week's
// days with what is already on them, and everything on the week without a
// day, each saying what it serves. Tap one, then a day; the day wears a stamp
// for it. What is left stays on the week with no day — nothing is pushed off.

import { useState } from 'react'
import type { StripDay } from '@/components/plan/deck/WeekStrip'
import { Stamp } from '@/components/plan/v2/Stamp'

export interface PlaceItem {
  key: string
  title: string
  /** "October goal · Organize documents", "Not under a goal" */
  from?: string
  onPlace: (day: Date) => Promise<boolean>
}

const SHOWN = 4

export function GiveThemADay({ days, items, placedCount, onBack, onLeave, primary }: {
  days: StripDay[]
  items: PlaceItem[]
  /** How many of the week's things already have a day (the fact line). */
  placedCount: number
  onBack?: () => void
  onLeave?: () => void
  primary: { label: string; run: () => void | Promise<void>; busy?: boolean }
}) {
  const [chosen, setChosen] = useState<string | null>(items[0]?.key ?? null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  // The day just given, wearing its stamp, and what it was given.
  const [given, setGiven] = useState<{ day: string; title: string } | null>(null)
  const selected = items.find((i) => i.key === chosen) ?? items[0] ?? null

  const place = async (d: StripDay) => {
    if (!selected) return
    setPending(true); setFailed(false)
    const ok = await selected.onPlace(d.date)
    setPending(false)
    if (!ok) { setFailed(true); return }
    setGiven({ day: d.key, title: selected.title })
    // The next one waits, already chosen.
    const next = items.find((i) => i.key !== selected.key)
    setChosen(next?.key ?? null)
  }

  return <div className="choose choose-days">
    <div className="choose-top">
      <span className="deck-kicker">This week</span>
      {onLeave && <span className="choose-top-right"><button type="button" className="choose-leave" onClick={onLeave}>Leave</button></span>}
    </div>
    <h2 className="choose-h">Give them a day</h2>
    <p className="choose-facts">Tap one, then a day · {items.length} on this week with no day · {placedCount} {placedCount === 1 ? 'has' : 'have'} one</p>
    <div className="deck-strip choose-strip">
      {days.map((d) => {
        const shown = d.lines.slice(0, SHOWN)
        const more = d.more + Math.max(0, d.lines.length - SHOWN)
        return <button key={d.key} type="button" className={`deck-day${shown.length ? '' : ' is-empty'}${d.past ? ' is-past' : ''}${selected && !d.past ? ' is-target' : ''}`}
          disabled={!selected || pending || d.past} onClick={() => { void place(d) }}
          aria-label={selected ? `Give “${selected.title}” ${d.label}` : d.label}>
          <b className={d.isWeekend ? 'is-weekend' : undefined}>{d.label}</b>
          {shown.length ? shown.map((line, i) => <span key={i}>{line}</span>) : <span>Nothing yet</span>}
          {more > 0 && <i>+{more} more</i>}
          {given?.day === d.key && <Stamp kind="carried" word={d.label} context={given.title} fresh className="choose-stamp-day" />}
        </button>
      })}
    </div>
    {failed && <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>}

    <section className="choose-loose" aria-label="No day yet">
      <h3 className="choose-loose-title">No day yet · {items.length}</h3>
      {items.length === 0
        ? <p className="choose-empty">Everything on this week has a day.</p>
        : <ul className="choose-place-list">
          {items.map((it) => <li key={it.key}>
            <button type="button" className={`choose-place${selected?.key === it.key ? ' is-on' : ''}`} aria-pressed={selected?.key === it.key} onClick={() => setChosen(it.key)}>
              <span className="choose-place-title">{it.title}</span>
              {it.from && <span className="choose-place-from">{it.from}</span>}
            </button>
          </li>)}
        </ul>}
    </section>

    <div className="choose-pager">
      {onBack ? <button type="button" className="canvas-link" onClick={onBack}>‹ Back to the goals</button> : <span />}
      <button type="button" className="deck-btn is-primary" disabled={primary.busy} onClick={() => { void primary.run() }}>{primary.busy ? 'Saving…' : primary.label}</button>
    </div>
  </div>
}
