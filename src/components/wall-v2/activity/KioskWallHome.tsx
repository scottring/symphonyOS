// The kitchen wall's Home, today first (Scott, 2026-11-17 — "make the kiosk
// view more like the home page", "no scrolling", "leave out the less useful
// info, like the stats boxes", "everything that DOES show should be
// clickable", and "it focuses on tomorrow mostly, when we need information
// for today"; mockup https://claude.ai/artifact/6WSePRy93axkNpiRuBXCZQ).
//
// Home's paper cards on the wall's ground:
//
//   banner   the one thing that leads: out the door, the next appointment,
//            dinner at dinner time, tomorrow's first thing after bedtime
//   Today    the day as a ribbon with a now line, all-day chips (specials,
//            the bag), the rows still to come, and the untimed things
//   side     dinner, what we wait for (and who waits on us), school;
//            tomorrow only as one small card, from dinner on
//
// Tomorrow leads only after bedtime, until midnight (wallHome). Nothing
// scrolls: each list shows what fits and says how many more. Every row,
// chip and card opens something. Presentation only: the Shell owns data
// and writes.
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Bus, ChevronRight, Moon, ShoppingBag, Utensils } from 'lucide-react'
import type { FamilyMember } from '@/types/family'
import { stillOnToday, type WallTodayRow } from '@/lib/wall/wallMomentsModel'
import { boardAssignments, wallHome, type BoardWait } from '@/lib/wall/activity/wallBoard'
import type { KioskHomeV1Props, V1Kid } from './KioskHomeV1'
import { Photo } from './KioskStages'

const first = (m: Pick<FamilyMember, 'name'>) => m.name.split(' ')[0]
/** "4:15p" → "4:15", "4p" → "4:00". */
const clock = (t: string) => { const m = t.match(/^(\d{1,2})(?::(\d{2}))?/); return m ? `${m[1]}:${m[2] ?? '00'}` : t }
/** "7:20" (minutes after midnight) for an anchor. */
const hhmm = (min: number) => `${((Math.floor(min / 60) + 11) % 12) + 1}:${String(min % 60).padStart(2, '0')}`
const span = (r: WallTodayRow) => (r.end ? `${clock(r.time)}–${clock(r.end)}` : clock(r.time))

function inTime(now: Date, at: number): string {
  const min = Math.round((at - now.getTime()) / 60_000)
  if (min <= 0) return 'Now'
  if (min < 60) return `In ${min} minute${min === 1 ? '' : 's'}`
  const h = Math.floor(min / 60), m = min % 60
  return `In ${h} hour${h === 1 ? '' : 's'}${m >= 5 ? ` ${m} min` : ''}`
}

function Face({ member, small }: { member?: Pick<FamilyMember, 'name' | 'initials' | 'color'>; small?: boolean }) {
  if (!member) return null
  return <span className={`kh-face ${small ? 'is-sm' : ''}`} style={{ background: member.color || undefined }} aria-hidden="true">{(member.initials || member.name).slice(0, 1)}</span>
}
const Chev = () => <ChevronRight className="kh-chev" aria-hidden="true" />

function Faces({ ids, members, small }: { ids: string[]; members: FamilyMember[]; small?: boolean }) {
  const who = ids.map((id) => members.find((m) => m.id === id)).filter((m): m is FamilyMember => !!m)
  if (!who.length) return null
  return (
    <span className="kh-faces">
      {who.map((m) => <Face key={m.id} member={m} small={small} />)}
      <span className="sr-only">{who.map(first).join(' & ')}</span>
    </span>
  )
}

/** A card heading, and the door at its right. */
function Head({ title, count, more, onMore, moreLabel }: { title: string; count?: number; more?: string; onMore?: () => void; moreLabel?: string }) {
  return (
    <div className="kh-head">
      <h2>{title}{count ? <span className="kh-count" aria-hidden="true">{count}</span> : null}</h2>
      {more && (onMore
        ? <button type="button" className="kh-open" onClick={onMore} aria-label={moreLabel}>{more}<Chev /></button>
        : <span className="kh-open is-quiet">{more}</span>)}
    </div>
  )
}

// ─── The banner: the one thing that leads ───────────────────────────────

interface Lead { eyebrow: string; title: string; sub?: ReactNode; who?: string[]; icon: 'go' | 'night'; onTap?: () => void }

function Banner({ lead, members }: { lead: Lead; members: FamilyMember[] }) {
  const Icon = lead.icon === 'night' ? Moon : Bus
  const body = (
    <>
      <span className="kh-lead-mark" aria-hidden="true"><Icon /></span>
      <span className="kh-lead-words">
        <span className="kh-eb">{lead.eyebrow}</span>
        <span className="kh-lead-title">{lead.title}</span>
        {(lead.sub || (lead.who && lead.who.length > 0)) ? <span className="kh-lead-sub">{lead.who && <Faces ids={lead.who} members={members} small />}{lead.sub}</span> : null}
      </span>
      {lead.onTap && <span className="kh-btn" aria-hidden="true">Details<Chev /></span>}
    </>
  )
  return lead.onTap
    ? <button type="button" className="kh-card kh-lead" onClick={lead.onTap} aria-label={`${lead.eyebrow}: ${lead.title}`}>{body}</button>
    : <section className="kh-card kh-lead" aria-label={lead.eyebrow}>{body}</section>
}

function DinnerBanner({ p }: { p: KioskHomeV1Props }) {
  const d = p.dinner!
  return (
    <section className="kh-card kh-lead is-dinner" aria-label="Dinner">
      <button type="button" className="kh-lead-photo" onClick={d.hasRecipe ? p.onOpenRecipe : p.onStartCooking} aria-label={`Open ${d.title}`}><Photo url={d.imageUrl} /></button>
      <span className="kh-lead-words">
        <span className="kh-eb">{d.timeLabel ?? 'Dinner tonight'}</span>
        <h1 className="kh-lead-title">{d.title}</h1>
        {d.cue && <span className="kh-lead-sub">{d.cue}</span>}
      </span>
      <span className="kh-lead-acts">
        {d.key && <button type="button" className="kh-btn is-primary" onClick={p.onStartCooking}>Step by step</button>}
        {d.hasRecipe && <button type="button" className="kh-btn" onClick={p.onOpenRecipe}>Recipe</button>}
      </span>
    </section>
  )
}

const specialsLine = (kids: V1Kid[], key: 'special' | 'tomorrowSpecial') =>
  kids.filter((k) => k[key]).map((k) => `${first(k.member)} ${k[key]}`).join(' · ')

/** What leads the day: the morning's door, else the next thing on the clock. */
function dayLead(p: KioskHomeV1Props, left: WallTodayRow[]): Lead | null {
  const now = p.now
  const t = now.getHours() * 60 + now.getMinutes()
  const m = p.anchors.morning
  if (m && p.pick.screen === 'out-the-door' && t < m.end + 10) {
    const school = left.find((r) => /school/i.test(r.title))
    const bag = p.kids.filter((k) => k.bag.length).map((k) => `${first(k.member)}: ${k.bag.join(', ')}`).join(' · ')
    const at = new Date(now); at.setHours(Math.floor(m.end / 60), m.end % 60, 0, 0)
    return {
      eyebrow: `Next · ${inTime(now, at.getTime()).toLowerCase()}`, title: `Out the door at ${hhmm(m.end)}`, icon: 'go',
      who: p.kids.map((k) => k.member.id),
      sub: [school ? `${school.title} ${clock(school.time)}` : null, bag ? `In the bag: ${bag}` : specialsLine(p.kids, 'special') || null].filter(Boolean).join(' · ') || undefined,
      onTap: school ? () => p.onTapRow(school.id) : p.onOpenDay,
    }
  }
  // The next thing to move for: the first not yet started; what is already
  // under way (school all day) leads only when nothing else is coming.
  const t0 = now.getTime()
  const next = left.find((r) => r.startsAt != null ? r.startsAt > t0 : !r.past) ?? left.find((r) => !r.past) ?? left[0]
  if (!next) return null
  const started = next.startsAt != null && next.startsAt <= now.getTime()
  return {
    eyebrow: started ? 'Now' : next.startsAt != null ? `Next · ${inTime(now, next.startsAt).toLowerCase()}` : 'Next',
    title: started && next.end ? `${next.title} until ${clock(next.end)}` : `${next.title} at ${clock(next.time)}`,
    sub: next.sub ?? undefined, who: next.owners, icon: 'go', onTap: () => p.onTapRow(next.id),
  }
}

function nightLead(p: KioskHomeV1Props): Lead {
  const rows = p.weekend.tomorrow
  const day = p.weekend.tomorrowLabel || 'Tomorrow'
  const bag = p.kids.filter((k) => (k.tomorrowBag ?? []).length).map((k) => `${first(k.member)}: ${(k.tomorrowBag ?? []).join(', ')}`).join(' · ')
  const specials = specialsLine(p.kids, 'tomorrowSpecial')
  const sub = [specials || null, bag ? `In the bag: ${bag}` : null].filter(Boolean).join(' · ') || undefined
  if (p.tomorrow.outTheDoor) return { eyebrow: 'First thing tomorrow', title: `Out the door at ${p.tomorrow.outTheDoor}`, sub, icon: 'night', who: p.kids.map((k) => k.member.id) }
  if (rows[0]) return { eyebrow: 'First thing tomorrow', title: `${rows[0].title} at ${clock(rows[0].time)}`, sub, who: rows[0].owners, icon: 'night', onTap: () => p.onTapRow(rows[0].id) }
  return { eyebrow: day, title: `${day} is free.`, sub, icon: 'night' }
}

// ─── Today: the ribbon, the chips, the rows ─────────────────────────────

/** The day drawn across its hours (as Home draws it): each timed thing a
 *  block in its lane, a moment a pin, and a line at now. */
function Ribbon({ rows, now, onTap, showNow }: { rows: WallTodayRow[]; now: Date; onTap: (id: string) => void; showNow: boolean }) {
  const timed = rows.filter((r) => r.startsAt != null)
  if (!timed.length) return null
  const base = new Date(timed[0].startsAt!); base.setHours(0, 0, 0, 0)
  const hour = (ms: number) => (ms - base.getTime()) / 3_600_000
  const from = Math.max(0, Math.min(7, ...timed.map((r) => Math.floor(hour(r.startsAt!)))))
  const to = Math.min(24, Math.max(21, ...timed.map((r) => Math.ceil(hour(r.endsAt ?? r.startsAt!)))))
  const at = (h: number) => ((Math.min(Math.max(h, from), to) - from) / (to - from)) * 100
  const lanes: number[] = []
  const blocks = timed.map((r) => {
    const start = hour(r.startsAt!)
    const moment = r.endsAt == null || hour(r.endsAt) - start < 0.25
    const end = moment ? start + (to - from) / 24 : hour(r.endsAt!)
    let lane = lanes.findIndex((free) => free <= start)
    if (lane < 0) { if (lanes.length < 3) { lane = lanes.length; lanes.push(end) } else lane = lanes.length - 1 } else lanes[lane] = end
    return { r, lane, moment, left: at(start), width: at(end) - at(start) }
  })
  const ticks: number[] = []
  for (let h = Math.ceil(from / 3) * 3; h <= to; h += 3) ticks.push(h)
  const nowH = hour(now.getTime())
  const nowIn = showNow && nowH > from && nowH < to
  return (
    <div className="kh-ribbon" style={{ '--lanes': Math.max(1, lanes.length) } as CSSProperties}>
      <div className="kh-ribbon-track">
        {ticks.map((h) => <span key={h} className="kh-ribbon-tick" style={{ left: `${at(h)}%` }} />)}
        {nowIn && <span className="kh-ribbon-past" style={{ width: `${at(nowH)}%` }} />}
        {blocks.map(({ r, lane, moment, left, width }) => (
          <button key={r.id} type="button" onClick={() => onTap(r.id)} aria-label={`${span(r)} ${r.title}`}
            className={`kh-blk is-${r.kind}${moment ? ' is-moment' : ''}${showNow && r.past && !r.open ? ' is-past' : ''}`}
            style={{ left: `${left}%`, width: moment ? undefined : `${width}%`, top: `calc(${lane} * var(--lane) + var(--lane-pad))` }}>
            {!moment && <span>{r.title}</span>}
          </button>
        ))}
        {nowIn && <span className="kh-ribbon-now" style={{ left: `${at(nowH)}%` }} />}
      </div>
      <div className="kh-ribbon-hours" aria-hidden="true">
        {ticks.map((h) => <span key={h} style={{ left: `${at(h)}%` }}>{h === 0 || h === 24 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`}</span>)}
      </div>
    </div>
  )
}

/** How many of a list's items fit its box without scrolling: measured after
 *  layout, again when the box changes size. Unmeasured (no layout, as in
 *  tests) shows them all. */
function useFit<T extends HTMLElement>(count: number): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [fit, setFit] = useState(count)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const box = el.clientHeight
      if (!box) { setFit(count); return }
      const items = [...el.children] as HTMLElement[]
      items.forEach((c) => { c.hidden = false })
      let n = 0
      for (const c of items) { if (c.offsetTop + c.offsetHeight <= box + 1) n++; else break }
      items.forEach((c, i) => { c.hidden = i >= n })
      setFit(n)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [count])
  return [ref, fit]
}

function Rows({ rows, p, nowAt, nowLabel, listRef, fadePast }: { rows: WallTodayRow[]; p: KioskHomeV1Props; nowAt: number; nowLabel: string; listRef: RefObject<HTMLUListElement | null>; fadePast: boolean }) {
  return (
    <ul className="kh-day" ref={listRef}>
      {rows.map((r, i) => (
        <li key={r.id}>
          <button type="button" className={`kh-row is-${r.kind}${fadePast && r.past && !r.open ? ' is-past' : ''}${i === nowAt ? ' is-next' : ''}`} onClick={() => p.onTapRow(r.id)}>
            {i === nowAt && <span className="kh-nowline" aria-hidden="true"><span>{nowLabel}</span></span>}
            <span className="kh-row-when">{span(r)}</span>
            <span className="kh-row-what"><span className={r.kind === 'event' ? 'kh-ebar' : r.kind === 'routine' ? 'kh-rmark' : 'kh-ring'} aria-hidden="true" /><span className="kh-row-t">{r.title}</span>{r.sub && <small>{r.sub}</small>}</span>
            <Faces ids={r.owners} members={p.members} />
            <Chev />
          </button>
        </li>
      ))}
    </ul>
  )
}

function KidChips({ kids, which, onOpenKid }: { kids: V1Kid[]; which: 'today' | 'tomorrow'; onOpenKid: (m: FamilyMember) => void }) {
  const chips = kids.flatMap((k) => {
    const special = which === 'today' ? k.special : k.tomorrowSpecial
    const bag = which === 'today' ? k.bag : k.tomorrowBag ?? []
    if (!special && !bag.length) return []
    return [(
      <button key={k.member.id} type="button" className="kh-chip" onClick={() => onOpenKid(k.member)}>
        <Face member={k.member} small /><b>{first(k.member)}</b>{special && <span>{special}</span>}
        {bag.length > 0 && <span className="kh-chip-bag"><ShoppingBag aria-hidden="true" />{bag.join(', ')}</span>}
      </button>
    )]
  })
  if (!chips.length) return null
  return <div className="kh-chips" role="group" aria-label="All day"><span className="kh-chips-label" aria-hidden="true">All day</span>{chips}</div>
}

function AnytimeChips({ items, label, onOpen }: { items: { title: string }[]; label: string; onOpen?: () => void }) {
  if (!items.length) return null
  const shown = items.slice(0, 4)
  return (
    <div className="kh-chips" role="group" aria-label={label}>
      <span className="kh-chips-label" aria-hidden="true">{label}</span>
      {shown.map((t) => <button key={t.title} type="button" className="kh-chip is-task" onClick={onOpen} disabled={!onOpen}><span className="kh-ring" aria-hidden="true" />{t.title}</button>)}
      {items.length > shown.length && <button type="button" className="kh-chip is-more" onClick={onOpen} disabled={!onOpen}>+{items.length - shown.length} more</button>}
    </div>
  )
}

function TodayCard({ p, night }: { p: KioskHomeV1Props; night: boolean }) {
  const all = night ? p.weekend.tomorrow : p.weekend.rows
  const left = all.filter(stillOnToday)
  // What's still to come, with the last thing that passed above it when the
  // day is nearly done. The list shows what fits and counts the rest.
  const lastPast = night ? -1 : all.reduce((at, r, i) => (r.past && !r.open ? i : at), -1)
  const shown = night ? all : [...(lastPast >= 0 && left.length < 4 ? [all[lastPast]] : []), ...left]
  const [listRef, fit] = useFit<HTMLUListElement>(shown.length)
  const hidden = shown.slice(fit).filter((r) => night || stillOnToday(r)).length
  // The now line sits above the first thing not yet started.
  const t0 = p.now.getTime()
  const nowAt = night ? -1 : shown.findIndex((r) => stillOnToday(r) && (r.startsAt == null || r.startsAt > t0))
  const title = night ? `Tomorrow · ${p.weekend.tomorrowLabel}` : 'Today'
  const nowLabel = clock(p.now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
  return (
    <section className="kh-card kh-today" aria-label={night ? 'Tomorrow' : 'Today'}>
      <Head title={title} more={hidden > 0 ? `+${hidden} more` : night ? undefined : 'Open the day'} onMore={night ? undefined : p.onOpenDay} moreLabel={hidden > 0 ? `${hidden} more today: open the day` : undefined} />
      <Ribbon rows={all} now={p.now} onTap={p.onTapRow} showNow={!night} />
      <KidChips kids={p.kids} which={night ? 'tomorrow' : 'today'} onOpenKid={p.onOpenKid} />
      {shown.length > 0
        ? <Rows rows={shown} p={p} nowAt={nowAt} nowLabel={nowLabel} listRef={listRef} fadePast={!night} />
        : <p className="kh-free">{night ? `Nothing on the clock ${p.weekend.tomorrowLabel ? `on ${p.weekend.tomorrowLabel}` : 'tomorrow'}.` : all.length ? 'Nothing else on the clock today.' : 'Nothing on the clock today.'}</p>}
      {!night && <AnytimeChips items={p.weekend.anytime} label="Anytime" onOpen={p.onOpenDay} />}
    </section>
  )
}

// ─── The side cards ─────────────────────────────────────────────────────

function DinnerCard({ p }: { p: KioskHomeV1Props }) {
  const d = p.dinner
  if (!d) return null
  const open = p.onOpenDinner ?? (d.hasRecipe ? p.onOpenRecipe : p.onStartCooking)
  return (
    <section className="kh-card kh-dinner" aria-label="Dinner tonight">
      <button type="button" className="kh-dinner-open" onClick={open} aria-label={`Dinner: ${d.title}`}>
        <Photo url={d.imageUrl} className="kh-dinner-photo" />
        <span className="kh-dinner-words"><span className="kh-eb"><Utensils aria-hidden="true" />{d.timeLabel ?? 'Dinner tonight'}</span><b>{d.title}</b></span>
      </button>
      {d.hasRecipe
        ? <button type="button" className="kh-btn" onClick={p.onOpenRecipe}>Recipe</button>
        : d.key ? <button type="button" className="kh-btn" onClick={p.onStartCooking}>Step by step</button> : null}
    </section>
  )
}

function WaitLine({ w, onOpen }: { w: BoardWait; onOpen?: (id: string) => void }) {
  return (
    <button type="button" className="kh-li" onClick={() => onOpen?.(w.id)} disabled={!onOpen}>
      {w.from.member ? <Face member={w.from.member} small /> : <span className="kh-face is-sm is-blank" aria-hidden="true" />}
      <span className="kh-li-words"><span className="kh-li-t">{w.title}</span><span className="kh-li-s">{w.from.name} → {w.to.name}</span></span>
      {w.when && <span className={`kh-when ${w.late || /^Due (today|tomorrow)/.test(w.when) ? 'is-late' : ''}`}>{w.when}</span>}
      <Chev />
    </button>
  )
}

function WaitingCard({ p, max, ours }: { p: KioskHomeV1Props; max: number; ours?: boolean }) {
  const w = p.board?.waits
  if (!w || max < 1) return null
  // What others wait on us for first: it is ours to do.
  const all = ours ? w.ours : [...w.ours, ...w.theirs]
  if (!all.length) return null
  const label = ours ? 'Waiting on us' : 'Waiting for'
  return (
    <section className="kh-card kh-list" aria-label={label}>
      <Head title={label} count={all.length} more={all.length > max ? `+${all.length - max} more` : undefined} />
      {all.slice(0, max).map((x) => <WaitLine key={x.id} w={x} onOpen={p.onOpenWork} />)}
    </section>
  )
}

function SchoolCard({ p, max }: { p: KioskHomeV1Props; max: number }) {
  const work = boardAssignments(p.kids)
  const news = p.board?.news?.items ?? []
  if (max < 1 || (!work.length && !news.length)) return null
  return (
    <section className="kh-card kh-list" aria-label="School">
      <Head title="School" count={work.length || undefined} more={p.onOpenSchool ? (work.length > max ? `All ${work.length}` : 'Digest') : work.length > max ? `+${work.length - max} more` : undefined} onMore={p.onOpenSchool} moreLabel="Open School" />
      {work.slice(0, max).map((a) => (
        <button key={a.key} type="button" className="kh-li" onClick={() => (a.taskId && p.onOpenWork ? p.onOpenWork(a.taskId) : p.onOpenSchool?.())} disabled={!(a.taskId && p.onOpenWork) && !p.onOpenSchool}>
          <span className="kh-faces">{a.who.map((m) => <Face key={m.id} member={m} small />)}<span className="sr-only">{a.who.map(first).join(' & ')}</span></span>
          <span className="kh-li-words"><span className="kh-li-t">{a.title}</span></span>
          {a.when && <span className={`kh-when ${a.late ? 'is-late' : ''}`}>{a.when}</span>}
          <Chev />
        </button>
      ))}
      {!work.length && news[0] && (
        <button type="button" className="kh-li" onClick={p.onOpenSchool} disabled={!p.onOpenSchool}>
          <span className="kh-li-words"><span className="kh-li-t">{news[0].title}</span>{news[0].sub && <span className="kh-li-s">{news[0].sub}</span>}</span>
          <Chev />
        </button>
      )}
    </section>
  )
}

/** Tomorrow, small: from dinner on, one line of what's coming. */
function TomorrowCard({ p }: { p: KioskHomeV1Props }) {
  const rows = p.weekend.tomorrow
  const day = p.weekend.tomorrowLabel || 'Tomorrow'
  const line = [
    p.tomorrow.outTheDoor ? `Out the door ${p.tomorrow.outTheDoor}` : null,
    ...rows.slice(0, 3).map((r) => `${r.title} ${clock(r.time)}`),
  ].filter(Boolean).join(' · ') || 'Nothing on the clock'
  const body = (
    <>
      <span className="kh-li-words"><span className="kh-tomorrow-t">Tomorrow · {day}</span><span className="kh-li-s">{line}</span></span>
      {rows[0] && <Chev />}
    </>
  )
  return (
    <section className="kh-card kh-list is-quiet" aria-label="Tomorrow">
      {rows[0]
        ? <button type="button" className="kh-li is-tomorrow" onClick={() => p.onTapRow(rows[0].id)}>{body}</button>
        : <div className="kh-li is-tomorrow">{body}</div>}
    </section>
  )
}

/** Today's loose ends, after bedtime: what's still open, and what to talk about. */
function LeftCard({ p }: { p: KioskHomeV1Props }) {
  const open = p.weekend.rows.filter((r) => r.open)
  const items = [
    ...open.map((r) => ({ key: r.id, title: r.title, onTap: () => p.onTapRow(r.id) })),
    ...p.weekend.anytime.map((a) => ({ key: `any-${a.title}`, title: a.title, onTap: p.onOpenDay })),
  ]
  const talks = p.talks.length
  if (!items.length && !talks) return null
  const max = talks ? 2 : 3
  return (
    <section className="kh-card kh-list" aria-label="Left from today">
      <Head title="Left from today" more={items.length > max ? `+${items.length - max} more` : undefined} onMore={p.onOpenDay} />
      {items.slice(0, max).map((x) => (
        <button key={x.key} type="button" className="kh-li" onClick={x.onTap} disabled={!x.onTap}>
          <span className="kh-ring" aria-hidden="true" /><span className="kh-li-words"><span className="kh-li-t">{x.title}</span></span><Chev />
        </button>
      ))}
      {talks > 0 && (
        <button type="button" className="kh-li" onClick={p.onNotes}>
          <span className="kh-li-words"><span className="kh-li-t">To talk about</span><span className="kh-li-s">{p.talks.slice(0, 2).map((t) => t.text).join(' · ')}</span></span><Chev />
        </button>
      )}
    </section>
  )
}

// ─── The screen ─────────────────────────────────────────────────────────

function Side({ p, which }: { p: KioskHomeV1Props; which: 'day' | 'dinner' | 'night' }) {
  const waits = p.board ? p.board.waits.ours.length + p.board.waits.theirs.length : 0
  const school = boardAssignments(p.kids).length || (p.board?.news?.items.length ? 1 : 0)
  if (which === 'night') {
    return <><LeftCard p={p} /><WaitingCard p={p} max={2} ours /></>
  }
  // From dinner on, tomorrow takes one small card at the foot.
  const evening = which === 'dinner' || p.now.getHours() * 60 + p.now.getMinutes() >= p.anchors.dinner
  // Dinner sits beside the day until it's eaten (an hour after it starts).
  const dinnerCard = which === 'day' && !!p.dinner && p.now.getHours() * 60 + p.now.getMinutes() < p.anchors.dinner + 60
  // Lines that fit beside the day: four, less one for dinner and one for tomorrow.
  const budget = 4 - (dinnerCard ? 1 : 0) - (evening ? 1 : 0)
  const waitMax = Math.min(waits, school ? Math.max(1, budget - 1) : budget)
  const schoolMax = Math.min(school, Math.max(0, budget - waitMax))
  return (
    <>
      {dinnerCard && <DinnerCard p={p} />}
      <WaitingCard p={p} max={waitMax} ours={which === 'dinner'} />
      <SchoolCard p={p} max={schoolMax} />
      {evening && <TomorrowCard p={p} />}
    </>
  )
}

/** Whether the side column has anything to hold; without, Today takes the width. */
function sideHas(p: KioskHomeV1Props, which: 'day' | 'dinner' | 'night'): boolean {
  const w = p.board?.waits
  if (which === 'night') return !!w?.ours.length || p.weekend.rows.some((r) => r.open) || p.weekend.anytime.length > 0 || p.talks.length > 0
  const evening = which === 'dinner' || p.now.getHours() * 60 + p.now.getMinutes() >= p.anchors.dinner
  return evening || (which === 'day' && !!p.dinner && p.now.getHours() * 60 + p.now.getMinutes() < p.anchors.dinner + 60) || !!(w && (w.ours.length || w.theirs.length)) || boardAssignments(p.kids).length > 0 || !!p.board?.news?.items.length
}

export function KioskWallHome(p: KioskHomeV1Props) {
  const which = wallHome(p.pick, p.now)
  const night = which === 'night'
  const left = p.weekend.rows.filter(stillOnToday)
  const lead = which === 'dinner' && p.dinner
    ? <DinnerBanner p={p} />
    : (() => {
      const l = night ? nightLead(p) : dayLead(p, left)
      return l ? <Banner lead={l} members={p.members} /> : <Banner lead={{ eyebrow: p.weekend.rows.length ? 'The rest of today' : 'A free day', title: p.weekend.rows.length ? 'Nothing else on the clock today.' : 'Nothing on the clock today.', icon: 'go', onTap: p.onOpenDay }} members={p.members} />
    })()
  const panel = p.aside ?? p.talk
  return (
    <div className={`kh-home ${panel ? 'has-panel' : ''}`} data-home={which}>
      <div className={`kh-main ${p.aside ? 'is-dim' : ''}`}>
        {lead}
        <div className="kh-pair">
          <TodayCard p={p} night={night} />
          {!panel && sideHas(p, which) && <aside className="kh-side" aria-label={night ? 'Left from today' : 'Also today'}><Side p={p} which={which} /></aside>}
        </div>
      </div>
      {panel && <div className="kh-panel">{panel}</div>}
    </div>
  )
}
