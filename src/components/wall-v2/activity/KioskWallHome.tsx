// The kitchen wall's Home, calm (Scott approved the mockups 2026-11-10: "a
// beautiful screen that is comfortable with blank space … that tells you
// just what you need and allows you to navigate"). Three screens, no kids'
// checklists, and no routine that runs most days (the day's rows already
// keep only those that run twice a week or less — routineEarnsTheWall):
//
//   day      today's appointments, large · dinner, waiting for and school
//            beside them, each only when there is something to say
//   dinner   tonight's dinner, large, with Step by step and Recipe ·
//            tomorrow and what others wait on us for beside it
//   night    dark: tomorrow, and what goes in the bag
//
// Nothing scrolls: each list shows what fits and counts the rest. More and
// the conversation take the side column; the lead stays, dimmed.
// Presentation only: the Shell owns data and writes.
import type { ReactNode } from 'react'
import type { FamilyMember } from '@/types/family'
import { stillOnToday, type WallTodayRow } from '@/lib/wall/wallMomentsModel'
import { boardAssignments, wallHome, type BoardWait } from '@/lib/wall/activity/wallBoard'
import type { KioskHomeV1Props, V1Kid } from './KioskHomeV1'

const first = (m: Pick<FamilyMember, 'name'>) => m.name.split(' ')[0]
/** "4:15p" → "4:15", "4p" → "4:00". */
const clock = (t: string) => { const m = t.match(/^(\d{1,2})(?::(\d{2}))?/); return m ? `${m[1]}:${m[2] ?? '00'}` : t }

function Face({ member, small }: { member?: Pick<FamilyMember, 'name' | 'initials' | 'color'>; small?: boolean }) {
  if (!member) return null
  return <span className={`kh-face ${small ? 'is-sm' : ''}`} style={{ background: member.color || undefined }} aria-hidden="true">{(member.initials || member.name).slice(0, 1)}</span>
}

function Eyebrow({ children, more = 0, tone }: { children: ReactNode; more?: number; tone?: 'sym' | 'now' }) {
  return <p className={`kh-eb ${tone ? `is-${tone}` : ''}`}><span>{children}</span>{more > 0 && <span className="kh-more">+{more} more</span>}</p>
}

/** Lead · hairline · side. More or the conversation take the side; the lead dims. */
function Frame({ lead, side, aside, talk, label, sideLabel }: { lead: ReactNode; side?: ReactNode; aside?: ReactNode; talk?: ReactNode; label: string; sideLabel: string }) {
  const right = aside ?? talk ?? side
  if (!right) return <div className="kh-stage is-full"><section className="kh-lead" aria-label={label}>{lead}</section></div>
  return (
    <div className="kh-stage">
      <section className={`kh-lead ${aside ? 'is-dim' : ''}`} aria-label={label}>{lead}</section>
      <div className="kh-vr" aria-hidden="true" />
      {aside || talk ? <div className="kh-side is-panel">{right}</div> : <aside className="kh-side" aria-label={sideLabel}>{right}</aside>}
    </div>
  )
}

function Rows({ rows, members, onTap, max }: { rows: WallTodayRow[]; members: FamilyMember[]; onTap: (id: string) => void; max: number }) {
  return (
    <>
      {rows.slice(0, max).map((r) => (
        <button key={r.id} type="button" className="kh-ev" onClick={() => onTap(r.id)}>
          <span className="kh-ev-t">{clock(r.time)}</span>
          <span className="kh-ev-w">{r.title}{r.sub && <small>{r.sub}</small>}</span>
          <span className="kh-faces">{r.owners.map((id) => <Face key={id} member={members.find((m) => m.id === id)} />)}</span>
          <span className="sr-only">{r.owners.map((id) => members.find((m) => m.id === id)?.name).filter(Boolean).join(' & ')}</span>
        </button>
      ))}
    </>
  )
}

const specialsOf = (kids: V1Kid[], key: 'special' | 'tomorrowSpecial') =>
  kids.filter((k) => k[key]).map((k) => <span key={k.member.id}><b>{first(k.member)}</b> {k[key]}</span>)
const joined = (parts: ReactNode[]) => parts.flatMap((part, i) => (i ? [' · ', part] : [part]))

function Bag({ kids, key_ }: { kids: V1Kid[]; key_: 'bag' | 'tomorrowBag' }) {
  const lines = kids.filter((k) => (k[key_] ?? []).length > 0).map((k) => `${first(k.member)}: ${(k[key_] ?? []).join(', ')}`)
  return lines.length ? <p className="kh-flag"><i>In the bag</i> {lines.join(' · ')}</p> : null
}

function WaitLine({ w, onOpen }: { w: BoardWait; onOpen?: (id: string) => void }) {
  const body = (
    <>
      <span className="kh-line-t">{w.title}</span>
      <span className="kh-line-sub">
        <span className="kh-line-who">{w.from.member ? <Face member={w.from.member} small /> : null}{w.from.name} → {w.to.name}</span>
        {w.when && <span className={`kh-when ${w.late || /^Due (today|tomorrow)/.test(w.when) ? 'is-now' : ''}`}>{w.when}</span>}
      </span>
    </>
  )
  return onOpen ? <button type="button" className="kh-line is-two" onClick={() => onOpen(w.id)}>{body}</button> : <div className="kh-line is-two">{body}</div>
}

function DinnerSide({ p }: { p: KioskHomeV1Props }) {
  const d = p.dinner
  if (!d) return null
  return (
    <section className="kh-sec" aria-label="Dinner tonight">
      <Eyebrow>{d.timeLabel ?? 'Dinner tonight'}</Eyebrow>
      <h2 className="kh-side-title">{d.title}</h2>
      {(d.hasRecipe || d.key) && (
        <div className="kh-acts">
          {d.hasRecipe
            ? <button type="button" className="kw-btn is-quiet" onClick={p.onOpenRecipe}>Recipe</button>
            : <button type="button" className="kw-btn is-quiet" onClick={p.onStartCooking}>Step by step</button>}
        </div>
      )}
    </section>
  )
}

function WaitingSide({ p, max, ours }: { p: KioskHomeV1Props; max: number; ours?: boolean }) {
  const w = p.board?.waits
  if (!w) return null
  // What others wait on us for first: it is ours to do.
  const all = ours ? w.ours : [...w.ours, ...w.theirs]
  if (!all.length) return null
  return (
    <section className="kh-sec" aria-label={ours ? 'Waiting on us' : 'Waiting for'}>
      <Eyebrow more={all.length - Math.min(max, all.length)}>{ours ? 'Waiting on us' : 'Waiting for'}</Eyebrow>
      {all.slice(0, max).map((x) => <WaitLine key={x.id} w={x} onOpen={p.onOpenWork} />)}
    </section>
  )
}

function SchoolSide({ p, max }: { p: KioskHomeV1Props; max: number }) {
  const work = boardAssignments(p.kids)
  const news = p.board?.news?.items ?? []
  if (!work.length && !news.length) return null
  return (
    <section className="kh-sec" aria-label="School">
      <Eyebrow more={work.length - Math.min(max, work.length)}>School</Eyebrow>
      {work.slice(0, max).map((a) => {
        const body = (
          <>
            <span className="kh-line-t">{a.title}</span>
            <span className="kh-line-sub">
              <span className="kh-faces">{a.who.map((m) => <Face key={m.id} member={m} small />)}</span>
              <span className="sr-only">{a.who.map(first).join(' & ')}</span>
              {a.when && <span className={`kh-when ${a.late ? 'is-now' : ''}`}>{a.when}</span>}
            </span>
          </>
        )
        return a.taskId && p.onOpenWork
          ? <button key={a.key} type="button" className="kh-line is-two" onClick={() => p.onOpenWork!(a.taskId!)}>{body}</button>
          : <div key={a.key} className="kh-line is-two">{body}</div>
      })}
      {!work.length && news[0] && <div className="kh-line"><span className="kh-line-t">{news[0].title}</span>{news[0].sub && <span className="kh-when">{news[0].sub}</span>}</div>}
    </section>
  )
}

function Day(p: KioskHomeV1Props) {
  const left = p.weekend.rows.filter(stillOnToday)
  const max = 4
  const specials = specialsOf(p.kids, 'special')
  const tomorrow = p.weekend.tomorrow
  const lead = (
    <>
      <Eyebrow tone="sym" more={left.length - Math.min(max, left.length)}>Today</Eyebrow>
      {left.length > 0
        ? <Rows rows={left} members={p.members} onTap={p.onTapRow} max={max} />
        : <h2 className="kh-free">{p.weekend.rows.length ? 'Nothing else on the clock today.' : 'Nothing on the clock today.'}</h2>}
      {specials.length > 0 && <p className="kh-specials">{joined(specials)}</p>}
      <Bag kids={p.kids} key_="bag" />
      {left.length === 0 && tomorrow.length > 0 && (
        <div className="kh-later">
          <Eyebrow>{p.weekend.tomorrowLabel || 'Tomorrow'}</Eyebrow>
          <Rows rows={tomorrow} members={p.members} onTap={p.onTapRow} max={2} />
        </div>
      )}
    </>
  )
  // What fits beside the day: three rows under dinner, five without; waits first.
  const budget = p.dinner ? 3 : 5
  const waitRows = Math.min(2, (p.board?.waits.ours.length ?? 0) + (p.board?.waits.theirs.length ?? 0))
  const parts = [<DinnerSide key="d" p={p} />, <WaitingSide key="w" p={p} max={2} />, <SchoolSide key="s" p={p} max={Math.max(1, Math.min(2, budget - waitRows))} />]
  const hasSide = !!p.dinner || !!(p.board && (p.board.waits.ours.length || p.board.waits.theirs.length)) || boardAssignments(p.kids).length > 0 || !!p.board?.news?.items.length
  return <Frame lead={lead} side={hasSide ? <>{parts}</> : undefined} aside={p.aside} talk={p.talk} label="Today" sideLabel="Also today" />
}

function Dinner(p: KioskHomeV1Props) {
  const d = p.dinner
  const lead = d ? (
    <div className="kh-centre">
      <Eyebrow tone="sym">{d.timeLabel ?? 'Dinner tonight'}</Eyebrow>
      <h1 className="kh-dish">{d.title}</h1>
      {d.cue && <p className="kh-cue">{d.cue}</p>}
      <div className="kh-acts is-lead">
        {d.key && <button type="button" className="kw-btn is-primary" onClick={p.onStartCooking}>Step by step</button>}
        {d.hasRecipe && <button type="button" className="kw-btn is-quiet" onClick={p.onOpenRecipe}>Recipe</button>}
      </div>
    </div>
  ) : (
    <div className="kh-centre"><Eyebrow tone="sym">Dinner</Eyebrow><h1 className="kh-dish">No dinner planned tonight.</h1></div>
  )
  const tomorrow = p.weekend.tomorrow
  const specials = specialsOf(p.kids, 'tomorrowSpecial')
  const side = (
    <>
      <section className="kh-sec" aria-label="Tomorrow">
        <Eyebrow more={tomorrow.length - Math.min(3, tomorrow.length)}>Tomorrow · {p.weekend.tomorrowLabel}</Eyebrow>
        {tomorrow.length
          ? tomorrow.slice(0, 3).map((r) => <div key={r.id} className="kh-line"><span className="kh-line-time">{clock(r.time)}</span><span className="kh-line-t">{r.title}</span></div>)
          : <h2 className="kh-side-title">Nothing on the clock</h2>}
        {specials.length > 0 && <p className="kh-specials is-side">{joined(specials)}</p>}
      </section>
      <WaitingSide p={p} max={2} ours />
    </>
  )
  return <Frame lead={lead} side={side} aside={p.aside} talk={p.talk} label="Dinner" sideLabel="Tomorrow" />
}

function Night(p: KioskHomeV1Props) {
  const tomorrow = p.weekend.tomorrow
  const day = p.weekend.tomorrowLabel || 'Tomorrow'
  const specials = specialsOf(p.kids, 'tomorrowSpecial')
  const lead = (
    <div className="kh-centre">
      <Eyebrow tone="sym" more={tomorrow.length - Math.min(4, tomorrow.length)}>Tomorrow</Eyebrow>
      {tomorrow.length
        ? <><h1 className="kh-night">{day}</h1><Rows rows={tomorrow} members={p.members} onTap={p.onTapRow} max={4} /></>
        : <h1 className="kh-night">{day} is free.</h1>}
      {specials.length > 0 && <p className="kh-specials is-night">{tomorrow.length ? null : 'Nothing on the clock. '}{joined(specials)}</p>}
      <Bag kids={p.kids} key_="tomorrowBag" />
    </div>
  )
  return <Frame lead={lead} aside={p.aside} talk={p.talk} label="Tomorrow" sideLabel="Tomorrow" />
}

export function KioskWallHome(p: KioskHomeV1Props) {
  const which = wallHome(p.pick, p.anchors, p.now)
  return which === 'dinner' ? <Dinner {...p} /> : which === 'night' ? <Night {...p} /> : <Day {...p} />
}
