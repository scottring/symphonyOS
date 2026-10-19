// Step 2 of planning a week: Give them a day (spec 2026-10-19). The week's
// days with what is already on them, and everything on the week without a
// day, each saying what it serves. Tap an item, then a day. What is left stays
// on the week with "No day yet" — nothing is pushed off it.

import { useState } from 'react'
import type { StripDay } from '@/components/plan/deck/WeekStrip'

export interface PlaceItem {
  key: string
  title: string
  /** "October · Organize documents", "Not under a line" */
  from?: string
  onPlace: (day: Date) => Promise<boolean>
}

const SHOWN = 4

export function GiveThemADay({ days, items, placedCount, onBack, primary }: {
  days: StripDay[]
  items: PlaceItem[]
  /** How many of the week's things already have a day (the fact line). */
  placedCount: number
  onBack?: () => void
  primary: { label: string; run: () => void | Promise<void>; busy?: boolean }
}) {
  const [chosen, setChosen] = useState<string | null>(items[0]?.key ?? null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const selected = items.find((i) => i.key === chosen) ?? items[0] ?? null

  const place = async (day: Date) => {
    if (!selected) return
    setPending(true); setFailed(false)
    const ok = await selected.onPlace(day)
    setPending(false)
    if (!ok) { setFailed(true); return }
    // The next one waits, already chosen.
    const next = items.find((i) => i.key !== selected.key)
    setChosen(next?.key ?? null)
  }

  return <div className="choose choose-days">
    <div className="choose-head">
      <h2 className="choose-h">Give them a day</h2>
      {onBack && <button type="button" className="canvas-link" onClick={onBack}>‹ Back</button>}
    </div>
    <p className="choose-facts">{items.length + placedCount} on this week · {placedCount} {placedCount === 1 ? 'has' : 'have'} a day</p>
    <div className="deck-strip choose-strip">
      {days.map((d) => {
        const shown = d.lines.slice(0, SHOWN)
        return <button key={d.key} type="button" className={`deck-day${shown.length ? '' : ' is-empty'}${d.past ? ' is-past' : ''}${selected && !d.past ? ' is-target' : ''}`}
          disabled={!selected || pending || d.past} onClick={() => { void place(d.date) }}
          aria-label={selected ? `Give “${selected.title}” ${d.label}` : d.label}>
          <b className={d.isWeekend ? 'is-weekend' : undefined}>{d.label}</b>
          {shown.length ? shown.map((line, i) => <span key={i}>{line}</span>) : <span>Nothing yet</span>}
          {d.more + Math.max(0, d.lines.length - SHOWN) > 0 && <i>+{d.more + Math.max(0, d.lines.length - SHOWN)} more</i>}
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
              {it.from && <span className="choose-place-from">{it.from}</span>}
              <span className="choose-place-title">{it.title}</span>
              {selected?.key === it.key && <span className="choose-place-hint">Tap a day</span>}
            </button>
          </li>)}
        </ul>}
    </section>

    <div className="choose-foot">
      <button type="button" className="deck-btn is-primary" disabled={primary.busy} onClick={() => { void primary.run() }}>{primary.busy ? 'Saving…' : primary.label}</button>
    </div>
  </div>
}
