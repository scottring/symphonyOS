// The kitchen wall's board (Scott approved the mockup 2026-11-10): the quiet
// daytime screen. Dinner tonight across the top; under it Calendar · Waiting
// for · School, three equal columns. Each column keeps to what fits — nothing
// scrolls — and says how many more when it can't show them all.
//
// Presentation only: the Shell reads the waits and the digest (wallBoard).
import type { ReactNode } from 'react'
import type { FamilyMember } from '@/types/family'
import type { WallTodayRow } from '@/lib/wall/wallMomentsModel'
import { stillOnToday } from '@/lib/wall/wallMomentsModel'
import { boardAssignments, type BoardNews, type BoardPerson, type BoardWait } from '@/lib/wall/activity/wallBoard'
import type { KioskHomeV1Props, V1Kid } from './KioskHomeV1'

export interface KioskBoardData {
  waits: { theirs: BoardWait[]; ours: BoardWait[] }
  news: BoardNews | null
}

function Face({ member, size = 'sm' }: { member?: Pick<FamilyMember, 'name' | 'initials' | 'color'>; size?: 'xs' | 'sm' }) {
  if (!member) return null
  return <span className={`kv-face is-${size}`} style={{ background: member.color || undefined }} aria-hidden="true">{(member.initials || member.name).slice(0, 1)}</span>
}

/** "4:15p" → "4:15", "4p" → "4:00". */
const clock = (t: string) => { const m = t.match(/^(\d{1,2})(?::(\d{2}))?/); return m ? `${m[1]}:${m[2] ?? '00'}` : t }
const first = (m: FamilyMember) => m.name.split(' ')[0]

/** Rows to show from two lists sharing `budget` rows, the first list first. */
function share<A, B>(a: A[], b: B[], budget: number, least = 1): [A[], B[]] {
  const bTake = Math.min(b.length, Math.max(budget - a.length, b.length ? least : 0))
  return [a.slice(0, budget - bTake), b.slice(0, bTake)]
}

/** A section's label, with how many more it holds than it shows. */
function Lab({ children, more = 0, className = '' }: { children: ReactNode; more?: number; className?: string }) {
  return <p className={`kb-lab ${className}`}><span>{children}</span>{more > 0 && <span className="kb-more">+{more} more</span>}</p>
}

// ─── Calendar ────────────────────────────────────────────────────────────

function Events({ rows, members, onTap }: { rows: WallTodayRow[]; members: FamilyMember[]; onTap: (id: string) => void }) {
  if (!rows.length) return null
  return (
    <ul className="kb-events">
      {rows.map((r) => (
        <li key={r.id}>
          <button type="button" className="kb-event" onClick={() => onTap(r.id)}>
            <span className="kb-event-t">{clock(r.time)}</span>
            <span className="kb-event-w">{r.title}{r.sub && <small>{r.sub}</small>}</span>
            <span className="kb-faces">{r.owners.map((id) => <Face key={id} member={members.find((m) => m.id === id)} />)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

const specials = (kids: V1Kid[], key: 'special' | 'tomorrowSpecial') =>
  kids.filter((k) => k[key]).map((k) => `${first(k.member)} ${k[key]}`).join(' · ')

function Calendar(p: KioskHomeV1Props) {
  const events = (rows: WallTodayRow[]) => rows.filter((r) => r.kind === 'event')
  const today = events(p.weekend.rows.filter(stillOnToday))
  const tomorrow = events(p.weekend.tomorrow)
  const todaySpecials = specials(p.kids, 'special')
  const tomorrowSpecials = specials(p.kids, 'tomorrowSpecial')
  // Five rows fit under the heading; each day's specials line takes one.
  const [t, m] = share(today, tomorrow, 5 - (todaySpecials ? 1 : 0) - (tomorrowSpecials ? 1 : 0), 1)
  return (
    <section className="kb-col" aria-label="Calendar">
      <h2 className="kb-h">Calendar</h2>
      <Lab className="is-now" more={today.length - t.length}>Today</Lab>
      {todaySpecials && <p className="kb-specials">{todaySpecials}</p>}
      <Events rows={t} members={p.members} onTap={p.onTapRow} />
      {!t.length && <p className="kb-quiet">Nothing else on the calendar today.</p>}
      {(m.length > 0 || tomorrowSpecials) && (
        <>
          <Lab className="is-gap" more={tomorrow.length - m.length}>{p.weekend.tomorrowLabel || 'Tomorrow'}</Lab>
          {tomorrowSpecials && <p className="kb-specials">{tomorrowSpecials}</p>}
          <Events rows={m} members={p.members} onTap={p.onTapRow} />
        </>
      )}
    </section>
  )
}

// ─── Waiting for ─────────────────────────────────────────────────────────

function Who({ person }: { person: BoardPerson }) {
  return person.member
    ? <span className="kb-who"><Face member={person.member} size="xs" />{person.name}</span>
    : <span className="kb-who is-out">{person.name}</span>
}

function WaitRows({ rows, onOpen }: { rows: BoardWait[]; onOpen?: (id: string) => void }) {
  return (
    <ul className="kb-rows">
      {rows.map((w) => {
        const body = (
          <>
            <span className="kb-row-t">{w.title}</span>
            <span className="kb-row-sub">
              <Who person={w.from} /><span className="kb-arrow" aria-label="to">→</span><Who person={w.to} />
              {w.when && <span className={`kb-when ${w.late || /tomorrow|today/i.test(w.when) && w.when.startsWith('Due') ? 'is-now' : ''}`}>{w.when}</span>}
            </span>
          </>
        )
        return <li key={w.id}>{onOpen ? <button type="button" className="kb-row" onClick={() => onOpen(w.id)}>{body}</button> : <div className="kb-row">{body}</div>}</li>
      })}
    </ul>
  )
}

function Waiting({ p, data }: { p: KioskHomeV1Props; data: KioskBoardData }) {
  const { theirs, ours } = data.waits
  const [a, b] = share(theirs, ours, 4)
  return (
    <section className="kb-col" aria-label="Waiting for">
      <h2 className="kb-h">Waiting for</h2>
      {!theirs.length && !ours.length && <p className="kb-quiet">Nothing waiting either way.</p>}
      {a.length > 0 && <><Lab more={theirs.length - a.length}>We’re waiting for</Lab><WaitRows rows={a} onOpen={p.onOpenWork} /></>}
      {b.length > 0 && <><Lab className={`is-now ${a.length ? 'is-gap' : ''}`} more={ours.length - b.length}>Waiting on us</Lab><WaitRows rows={b} onOpen={p.onOpenWork} /></>}
    </section>
  )
}

// ─── School ──────────────────────────────────────────────────────────────

function School({ p, data }: { p: KioskHomeV1Props; data: KioskBoardData }) {
  const work = boardAssignments(p.kids)
  const news = data.news?.items ?? []
  const [w, n] = share(work, news, 4)
  return (
    <section className="kb-col" aria-label="School">
      <h2 className="kb-h">School</h2>
      <Lab more={work.length - w.length}>Assignments</Lab>
      {w.length ? (
        <ul className="kb-rows">
          {w.map((a) => {
            const body = (
              <>
                <span className="kb-row-t">{a.title}</span>
                <span className="kb-row-sub">
                  <span className="kb-faces">{a.who.map((m) => <Face key={m.id} member={m} size="xs" />)}</span>
                  <span className="sr-only">{a.who.map(first).join(' & ')}</span>
                  {a.when && <span className={`kb-when ${a.late ? 'is-now' : ''}`}>{a.when}</span>}
                </span>
              </>
            )
            return <li key={a.key}>{a.taskId && p.onOpenWork ? <button type="button" className="kb-row" onClick={() => p.onOpenWork!(a.taskId!)}>{body}</button> : <div className="kb-row">{body}</div>}</li>
          })}
        </ul>
      ) : <p className="kb-quiet">No school work open.</p>}
      {n.length > 0 && (
        <>
          <Lab className="is-gap" more={news.length - n.length}>Announcements · {data.news!.label}</Lab>
          <ul className="kb-rows">
            {n.map((item, i) => (
              <li key={i}><div className="kb-row is-news"><span className="kb-row-t">{item.title}</span>{item.sub && <span className="kb-row-sub">{item.sub}</span>}</div></li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

// ─── The board ───────────────────────────────────────────────────────────

export function KioskBoard({ p, data }: { p: KioskHomeV1Props; data: KioskBoardData }) {
  const d = p.dinner
  return (
    <div className="kb-board">
      <section className="kb-dinner" aria-label="Dinner tonight">
        <div className="kb-dinner-text">
          <p className="kb-lab is-sym">{d?.timeLabel ?? 'Dinner tonight'}</p>
          <h2 className="kb-dinner-title">{d ? d.title : 'Nothing planned yet'}</h2>
          {d?.cue && <p className="kb-dinner-cue">{d.cue}</p>}
        </div>
        {d?.hasRecipe && <button type="button" className="kw-btn is-primary" onClick={p.onOpenRecipe}>Recipe</button>}
        {d?.key && <button type="button" className={`kw-btn ${d.hasRecipe ? 'is-quiet' : 'is-primary'}`} onClick={p.onStartCooking}>Step by step</button>}
      </section>
      <div className="kb-cols">
        <Calendar {...p} />
        <Waiting p={p} data={data} />
        <School p={p} data={data} />
      </div>
    </div>
  )
}
