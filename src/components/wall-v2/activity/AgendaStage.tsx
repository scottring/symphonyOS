// Everything on today, or the weekend (Scott, 2026-10-18: "all items for
// today/this weekend … an option on the main screen, and the items shown need
// to have a check circle"). The dock's Today button opens it; Today · This
// weekend switch in place from the top band (AgendaViews), so the lists get
// the stage's full height. Two columns, compact (Scott, 2026-10-18): Today
// is on the clock beside anytime, the weekend's unfinished anytime things
// under today's; the weekend is a column a day. Every task and routine, on any of those days,
// leads with a check that ticks it off or back on; an event keeps a blank of
// the same width so the times line up. Less scrolling ("as little as
// possible"): one line a row, and done things fold to one line at the foot.
// A day that still overflows scrolls inside its column.
//
// Presentation only: the Shell owns the data and the writes.

import { useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import type { FamilyMember } from '@/types/family'
import type { AgendaDay, AgendaRow, AgendaView } from '@/lib/wall/wallAgenda'

export interface AgendaStageProps {
  view: AgendaView
  days: Record<AgendaView, AgendaDay[]>
  members: FamilyMember[]
  onSetDone: (row: AgendaRow, done: boolean) => void
  onTapRow: (id: string) => void
}

const VIEWS: { view: AgendaView; label: string }[] = [
  { view: 'today', label: 'Today' },
  { view: 'weekend', label: 'This weekend' },
]

/** "4:15p" / "6p" → "4:15" / "6:00", as the side column writes times. */
const tlTime = (t: string) => {
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?/)
  return m ? `${m[1]}:${m[2] ?? '00'}` : t
}

/** Done things and events that are over fold into one line at the foot of
 *  the list (less scrolling); a tap opens them, to untick one. A row ticked
 *  here stays put until the wall refetches. */
const folds = (r: AgendaRow) => r.done || (r.past && r.kind === 'event')

function Rows({ rows, p, flipped, flip, anytime }: {
  rows: AgendaRow[]; p: AgendaStageProps; flipped: ReadonlyMap<string, boolean>
  flip: (r: AgendaRow, done: boolean) => void; anytime?: boolean
}) {
  const [open, setOpen] = useState(false)
  const folded = rows.filter(folds)
  const shown = open ? rows : rows.filter((r) => !folds(r))
  return <>{shown.map((r) => {
    const done = flipped.get(r.id) ?? r.done
    const who = r.sub ?? (r.owners.map((id) => p.members.find((m) => m.id === id)?.name).filter(Boolean).join(' & ') || null)
    return (
      <div key={r.id} className={`kw-tl-row ka-row ${anytime ? 'is-anytime' : ''} ${done ? 'is-done' : ''} ${r.past && !done && r.kind === 'event' ? 'is-past' : ''}`}>
        {r.checkable ? (
          <button type="button" className={`kw-tl-ck ${done ? 'is-done' : ''}`} aria-pressed={done}
            aria-label={done ? `Mark ${r.title} not done` : `Mark ${r.title} done`} onClick={() => flip(r, !done)}>
            <span aria-hidden="true">{done && <Check />}</span>
          </button>
        ) : <span className="kw-tl-ck" aria-hidden="true" />}
        <button type="button" className="kw-tl" onClick={() => p.onTapRow(r.id)}>
          <span className="kw-tl-t">{r.time && !anytime ? tlTime(r.time) : ''}</span>
          <span className="kw-tl-w"><span>{r.title}</span>{who && <span className="kw-tl-by">{who}</span>}</span>
        </button>
      </div>
    )
  })}
  {folded.length > 0 && (
    <button type="button" className="ka-fold" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
      <Check aria-hidden="true" /><span>{anytime ? 'Done' : 'Done and earlier'} · {folded.length}</span>
      {open ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
    </button>
  )}</>
}

/** Today · This weekend, in the top band while the stage is open. */
export function AgendaViews({ view, onView }: { view: AgendaView; onView: (view: AgendaView) => void }) {
  return (
    <div className="ka-views" role="group" aria-label="Show">
      {VIEWS.map((v) => (
        <button key={v.view} type="button" aria-pressed={view === v.view} onClick={() => onView(v.view)}>{v.label}</button>
      ))}
    </div>
  )
}

function AllDay({ titles }: { titles: string[] }) {
  if (!titles.length) return null
  return <ul className="ka-allday" aria-label="All day">{titles.map((t, i) => <li key={`${t}-${i}`}>{t}</li>)}</ul>
}

export function AgendaStage(p: AgendaStageProps) {
  // A check fills at once; the wall's refetch then agrees.
  const [flipped, setFlipped] = useState<ReadonlyMap<string, boolean>>(new Map())
  const flip = (r: AgendaRow, done: boolean) => {
    setFlipped((m) => new Map(m).set(r.id, done))
    p.onSetDone(r, done)
  }
  const days = p.days[p.view]
  const col = (lab: string, body: ReactNode, key: string) => (
    <section key={key} className="ka-col" aria-label={lab}>
      <p className="kw-eyebrow ka-lab">{lab}</p>
      <div className="ka-list">{body}</div>
    </section>
  )
  const empty = (text: string) => <p className="kw-quiet ka-empty">{text}</p>

  let cols: ReactNode[]
  if (p.view === 'today') {
    const d = days[0]
    // The weekend's anytime things still to do wait under today's (Scott,
    // 2026-10-18): "see unfinished anytime this weekend items on the today view".
    const later = p.days.weekend.filter((w) => !w.isToday)
    const soon = later.flatMap((w) => w.anytime.filter((r) => !r.done))
    const soonLab = later.length === 1 ? later[0].label : 'This weekend'
    cols = d ? [
      col('On the clock', <><AllDay titles={d.allDay} />{d.timed.length ? <Rows rows={d.timed} p={p} flipped={flipped} flip={flip} /> : empty('Nothing on the clock today.')}</>, 'timed'),
      col('Anytime today', (
        <>
          {d.anytime.length ? <Rows rows={d.anytime} p={p} flipped={flipped} flip={flip} anytime /> : empty('Nothing else today.')}
          {soon.length > 0 && <p className="kw-eyebrow ka-lab is-gap">Anytime · {soonLab}</p>}
          <Rows rows={soon} p={p} flipped={flipped} flip={flip} anytime />
        </>
      ), 'anytime'),
    ] : [col('Today', empty('Nothing on today.'), 'none')]
  } else {
    cols = days.length ? days.map((d) => col(d.label, (
      <>
        <AllDay titles={d.allDay} />
        <Rows rows={d.timed} p={p} flipped={flipped} flip={flip} />
        {d.anytime.length > 0 && <p className="kw-eyebrow ka-lab is-gap">Anytime</p>}
        <Rows rows={d.anytime} p={p} flipped={flipped} flip={flip} anytime />
        {!d.allDay.length && !d.timed.length && !d.anytime.length && empty('Nothing planned yet.')}
      </>
    ), d.key)) : [col('This weekend', empty('Nothing planned yet.'), 'none')]
  }

  return (
    <div className="ka-stage">
      <div className="ka-cols">
        {cols.flatMap((c, i) => (i ? [<div key={`rule-${i}`} className="ka-rule" aria-hidden="true" />, c] : [c]))}
      </div>
    </div>
  )
}
