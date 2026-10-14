// The kitchen wall's Home, version 1 (Scott, 2026-10-13; mockup
// https://claude.ai/artifact/QgfzGwNhgKaECK74dk5nJP). One thing leads at a
// time, chosen by kioskScreen from the household's routines:
//
//   out-the-door   countdown to leaving · each kid's steps as chips · the bag
//   rest           the place's scenery · one sentence · notes for the house ·
//                  the places (Groceries, Recipes, Call, Notes)
//   home           each kid's after-school work · tonight's dinner beside it
//   dinner         the dinner view the wall had until Oct 10 (photo, cue,
//                  what you have, ×1–3, add what's missing) · the question
//                  of the day as the centrepiece
//   bedtime        steps × kids · lights out as an arc
//   night          tomorrow's one time, large · who has what · the first
//                  thing and the rest of tomorrow · things to talk about
//   weekend        the day in hours with who's in each block · sometime today
//
// Graphics carry the information (rings are time left, chips are steps,
// faces are people); words only for names and the sentence that matters.
// Presentation only: the Shell owns data, permissions and writes.

import type { ReactNode } from 'react'
import { Check, ChevronRight, Clock, ShoppingCart, BookOpen, Phone, StickyNote, ChefHat, MessageSquare } from 'lucide-react'
import type { FamilyMember } from '@/types/family'
import type { KidRow } from '@/lib/wall/kidDayModel'
import type { WallTodayRow } from '@/lib/wall/wallMomentsModel'
import type { BedtimeGrid } from '@/lib/wall/activity/kioskRoutines'
import { minutesOf, type DayAnchors, type KioskScreenPick } from '@/lib/wall/activity/kioskScreen'
import { parseWallClock } from '@/lib/wall/activity/kioskCompose'
import { BedtimeStage, Photo, type KioskDinner } from './KioskStages'

export interface V1Kid {
  member: FamilyMember
  special: string | null
  tomorrowSpecial: string | null
  /** What goes in the bag today: the needed items (permission slip, library book). */
  bag: string[]
  morning: KidRow[]
  after: KidRow[]
}

export interface V1Note { id: string; text: string; by: string | null }

export interface KioskHomeV1Props {
  pick: KioskScreenPick
  now: Date
  anchors: DayAnchors
  members: FamilyMember[]
  kids: V1Kid[]
  /** The rest screen's one sentence ("Pickup at 5:30 · Tacos at 6") and a second line. */
  restLine: string
  restSub: string | null
  notes: V1Note[]
  talks: V1Note[]
  dinner: KioskDinner | null
  have: number[]
  scale: number
  question: string | null
  bedtime: BedtimeGrid
  tomorrow: { label: string; outTheDoor: string | null; specials: { member: FamilyMember; text: string }[] }
  weekend: { rows: WallTodayRow[]; anytime: { title: string; owners: string[] }[]; tomorrow: WallTodayRow[]; tomorrowLabel: string }
  onTick: (member: FamilyMember, row: KidRow) => void
  onOpenKid: (member: FamilyMember) => void
  onToggleHave: (index: number) => void
  onScale: (n: number) => void
  onAddMissing: () => void
  onOpenRecipe: () => void
  onStartCooking: () => void
  onAnotherQuestion?: () => void
  onTapRow: (id: string) => void
  places: { onGroceries: () => void; onRecipes: () => void; onCall: () => void; onNotes: () => void }
}

const SHARED = '__shared'

/** A person: their colour and initial, the same everywhere on the wall. */
export function Face({ member, size = 'md' }: { member: Pick<FamilyMember, 'name' | 'initials' | 'color'> | undefined; size?: 'sm' | 'md' | 'lg' }) {
  if (!member) return null
  return (
    <span className={`kv-face is-${size}`} style={{ background: member.color || undefined }} aria-hidden="true">
      {(member.initials || member.name.slice(0, 1)).slice(0, 1)}
    </span>
  )
}

function Faces({ ids, members, size = 'sm' }: { ids: string[]; members: FamilyMember[]; size?: 'sm' | 'md' }) {
  const people = ids.map((id) => members.find((m) => m.id === id)).filter((m): m is FamilyMember => !!m)
  if (!people.length) return null
  return <span className="kv-faces" aria-label={people.map((p) => p.name).join(', ')}>{people.map((p) => <Face key={p.id} member={p} size={size} />)}</span>
}

/** Time left as a ring: full when the window opens, empty when it closes. */
function Ring({ left, total, size, children }: { left: number; total: number; size: number; children: ReactNode }) {
  const r = size / 2 - 18
  const c = 2 * Math.PI * r
  const frac = total > 0 ? Math.min(1, Math.max(0, left / total)) : 0
  return (
    <div className="kv-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="kv-ring-track" />
        <circle cx={size / 2} cy={size / 2} r={r} className="kv-ring-fill"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="kv-ring-label">{children}</div>
    </div>
  )
}

const clockLabel = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}`
}
const nowMin = (d: Date) => d.getHours() * 60 + d.getMinutes()

/** A step chip: done, the one under way, or still to do. */
function StepChip({ row, current, onTick, label, startsAt }: { row: KidRow; current: boolean; onTick: () => void; label: string; startsAt: number | null }) {
  // A step without its own time inherits the routine's start; show only its own.
  const t = minutesOf(row.timeOfDay)
  const own = t != null && t !== startsAt ? t : null
  // "Bag packed: homework folder, …" — the chip says the step; the bag says what.
  const short = row.title.split(':')[0].trim() || row.title
  return (
    <button type="button" aria-pressed={row.done} aria-label={`${label}: ${row.title}`} onClick={onTick}
      className={`kv-chip ${row.done ? 'is-done' : current ? 'is-now' : ''}`}>
      {row.done && <Check aria-hidden="true" />}
      <span>{short}</span>
      {own != null && !row.done && <small>{clockLabel(own)}</small>}
    </button>
  )
}

function isForKid(row: KidRow, kidId: string) {
  return !row.by || row.by.length === 0 || row.by.includes(kidId)
}

function OutTheDoor(p: KioskHomeV1Props) {
  const end = p.anchors.morning?.end ?? 0
  const start = p.anchors.morning?.start ?? end - 35
  const left = Math.max(0, end - nowMin(p.now))
  const walker = p.kids[0]?.morning.find((r) => r.by?.length && !r.by.some((id) => p.kids.some((k) => k.member.id === id)) && minutesOf(r.timeOfDay) === end)
  const shared = p.kids[0]?.morning.filter((r) => r.by?.length && !p.kids.some((k) => r.by!.includes(k.member.id)) && r !== walker) ?? []
  return (
    <div className="kv-row">
      <section className="kv-card kv-countdown" aria-label="Countdown">
        <Ring left={left} total={end - start + 15} size={380}>
          <b className="kv-big">{left}</b><span>minute{left === 1 ? '' : 's'}</span>
        </Ring>
        <div className="kv-center">
          <div className="kv-strong">Out the door at {clockLabel(end)}</div>
          {walker && <div className="kv-muted"><Faces ids={walker.by ?? []} members={p.members} /> {walker.title}</div>}
        </div>
        {shared.length > 0 && (
          <ul className="kv-shared" aria-label="Grown-ups this morning">
            {shared.map((r) => <li key={r.id}><Faces ids={r.by ?? []} members={p.members} /><span>{r.title}</span>{r.timeOfDay && <small>{clockLabel(minutesOf(r.timeOfDay) ?? 0)}</small>}</li>)}
          </ul>
        )}
      </section>
      <section className="kv-kids" aria-label="Each kid's morning">
        {p.kids.map((k) => {
          const steps = k.morning.filter((r) => isForKid(r, k.member.id))
          const current = steps.find((r) => !r.done)
          const done = steps.filter((r) => r.done).length
          return (
            <div key={k.member.id} className="kv-card kv-kid">
              <button type="button" className="kv-kid-head" onClick={() => p.onOpenKid(k.member)}>
                <Face member={k.member} size="lg" />
                <span><b>{k.member.name}</b>{k.special && <small>{k.special} today</small>}</span>
                <span className="kv-count">{done} of {steps.length}</span>
              </button>
              <div className="kv-chips">
                {steps.map((r) => <StepChip key={r.id} row={r} current={r === current} label={k.member.name} startsAt={p.anchors.morning?.start ?? null} onTick={() => p.onTick(k.member, r)} />)}
                {steps.length === 0 && <p className="kv-quiet">Nothing on {k.member.name}'s morning.</p>}
              </div>
              {k.bag.length > 0 && (
                <div className="kv-bag">
                  <p className="kv-lab">In the bag</p>
                  <div className="kv-tags">{k.bag.map((b) => <span key={b} className="kv-tag is-today">{b}</span>)}</div>
                </div>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}

function Places({ places }: { places: KioskHomeV1Props['places'] }) {
  const item = (label: string, Icon: typeof Phone, onClick: () => void) => (
    <button type="button" className="kv-place" onClick={onClick}><Icon aria-hidden="true" />{label}</button>
  )
  return (
    <nav className="kv-places" aria-label="Places">
      {item('Groceries', ShoppingCart, places.onGroceries)}
      {item('Recipes', BookOpen, places.onRecipes)}
      {item('Call', Phone, places.onCall)}
      {item('Notes', StickyNote, places.onNotes)}
    </nav>
  )
}

function Rest(p: KioskHomeV1Props) {
  return (
    <div className="kv-scene">
      <div className="kv-sky">
        <section className="kv-sentence" aria-label="Today">
          <p className="kv-line">{p.restLine}</p>
          {p.restSub && <p className="kv-muted">{p.restSub}</p>}
        </section>
        <Places places={p.places} />
      </div>
      {p.notes.length > 0 && (
        <ul className="kv-notes" aria-label="Notes for the house">
          {p.notes.slice(0, 3).map((n, i) => (
            <li key={n.id} className="kv-note" style={{ ['--tilt' as string]: `${[1.6, -1.2, 0.8][i]}deg` }}>
              <p>{n.text}</p>{n.by && <small>{n.by}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function HomeFromSchool(p: KioskHomeV1Props) {
  return (
    <div className="kv-row">
      <section className="kv-kids" aria-label="After school">
        {p.kids.map((k) => {
          const rows = k.after.filter((r) => isForKid(r, k.member.id))
          const current = rows.find((r) => !r.done)
          return (
            <div key={k.member.id} className="kv-card kv-kid">
              <button type="button" className="kv-kid-head" onClick={() => p.onOpenKid(k.member)}>
                <Face member={k.member} size="lg" />
                <span><b>{k.member.name}</b></span>
                <ChevronRight aria-hidden="true" className="kv-go" />
              </button>
              <div className="kv-work">
                {rows.map((r) => (
                  <button key={`${r.entityType}:${r.id}`} type="button" aria-pressed={r.done} onClick={() => p.onTick(k.member, r)}
                    className={`kv-work-row ${r.done ? 'is-done' : r === current ? 'is-now' : ''}`}>
                    <span className="kv-check" aria-hidden="true">{r.done && <Check />}</span>
                    <span>{r.title}</span>
                    {r.target && <small>{r.target.amount} {r.target.unit}</small>}
                  </button>
                ))}
                {rows.length === 0 && <p className="kv-quiet">Nothing to do after school.</p>}
              </div>
            </div>
          )
        })}
      </section>
      <DinnerSide {...p} />
    </div>
  )
}

function DinnerSide(p: KioskHomeV1Props) {
  const d = p.dinner
  return (
    <aside className="kv-card kv-dinner-side" aria-label="Dinner">
      {d ? (
        <>
          <button type="button" className="kv-dinner-photo" onClick={d.hasRecipe ? p.onOpenRecipe : undefined} aria-label={d.hasRecipe ? `${d.title}: open the recipe` : d.title}>
            <Photo url={d.imageUrl} className="kv-fill" />
          </button>
          <div className="kv-pad">
            <p className="kv-lab">{d.timeLabel ?? 'Dinner tonight'}</p>
            <p className="kv-title">{d.title}</p>
            {d.cue && <p className="kv-cue"><Clock aria-hidden="true" />{d.cue}</p>}
          </div>
        </>
      ) : <div className="kv-pad"><p className="kv-lab">Dinner</p><p className="kv-quiet">Nothing planned yet.</p></div>}
    </aside>
  )
}

/** The dinner view the wall had until Oct 10 (Scott: keep it), beside the question of the day. */
function Dinner(p: KioskHomeV1Props) {
  const d = p.dinner
  return (
    <div className="kv-row">
      <section className="kv-card kv-dinner" aria-label="Tonight's dinner">
        {d ? (
          <>
            <div className="kv-dinner-hero">
              <button type="button" className="kv-dinner-photo" onClick={d.hasRecipe ? p.onOpenRecipe : undefined} aria-label={d.hasRecipe ? `${d.title}: open the recipe` : d.title}>
                <Photo url={d.imageUrl} className="kv-fill" />
              </button>
              <div className="kv-dinner-cap">
                <p className="kv-title">{d.title}</p>
                {d.minutes && <small>{d.minutes} min</small>}
              </div>
            </div>
            {d.cue && <p className="kv-cue"><Clock aria-hidden="true" />{d.cue}</p>}
            <div className="kv-dinner-body">
              <ul className="kv-have" aria-label="What you have">
                {d.ingredients.map((line, i) => {
                  const have = p.have.includes(i)
                  return (
                    <li key={i}>
                      <button type="button" aria-pressed={have} onClick={() => p.onToggleHave(i)} className={have ? 'is-have' : ''}>
                        <span className="kv-check" aria-hidden="true">{have && <Check />}</span><span>{line}</span>
                      </button>
                    </li>
                  )
                })}
                {d.ingredients.length === 0 && <li className="kv-quiet">No ingredient list for this one.</li>}
              </ul>
              <div className="kv-dinner-acts">
                {d.hasRecipe && <button type="button" className="kv-btn is-primary" onClick={p.onOpenRecipe}>Cook from the recipe <ChevronRight aria-hidden="true" /></button>}
                {d.key && <button type="button" className="kv-btn" onClick={p.onStartCooking}><ChefHat aria-hidden="true" />Step by step, with timers</button>}
                <div className="kv-scale" role="group" aria-label="Scale the recipe">
                  {[1, 2, 3].map((n) => <button key={n} type="button" aria-pressed={p.scale === n} onClick={() => p.onScale(n)}>×{n}</button>)}
                </div>
                {d.ingredients.length > 0 && <button type="button" className="kv-btn" onClick={p.onAddMissing}><ShoppingCart aria-hidden="true" />Add what's missing</button>}
              </div>
            </div>
          </>
        ) : <p className="kv-quiet">No dinner planned tonight.</p>}
      </section>
      <section className="kv-card kv-question" aria-label="Question of the day">
        <p className="kv-lab is-voice">Question of the day</p>
        {p.question
          ? <p className="kv-question-text">{p.question}</p>
          : <p className="kv-quiet">No question today.</p>}
        <div className="kv-question-foot">
          <Faces ids={p.members.map((m) => m.id)} members={p.members} size="md" />
          <span className="kv-muted">Everyone answers.</span>
          {p.onAnotherQuestion && <button type="button" className="kv-btn" onClick={p.onAnotherQuestion}>Another question</button>}
        </div>
      </section>
    </div>
  )
}

function Bedtime(p: KioskHomeV1Props) {
  const left = Math.max(0, p.anchors.bedtime.end - nowMin(p.now))
  return (
    <div className="kv-row">
      <div className="kv-grow"><BedtimeStage grid={p.bedtime} onTick={(id, row) => { const m = p.members.find((x) => x.id === id); if (m) p.onTick(m, row) }} /></div>
      <aside className="kv-card kv-countdown is-narrow" aria-label="Lights out">
        <Ring left={left} total={p.anchors.bedtime.end - p.anchors.bedtime.start} size={320}>
          <b className="kv-big">{left}</b><span>minutes</span>
        </Ring>
        <div className="kv-center">
          <div className="kv-strong">Lights out at {clockLabel(p.anchors.bedtime.end)}</div>
          {p.tomorrow.specials.length > 0 && <div className="kv-muted">Tomorrow: {p.tomorrow.specials.map((s) => `${s.member.name} ${s.text}`).join(' · ')}</div>}
        </div>
      </aside>
    </div>
  )
}

/** Night (mockup 2026-10-14): tomorrow's one time, large; who has what;
 *  the first thing in the morning and what else is on the clock beside it. */
function Night(p: KioskHomeV1Props) {
  const t = p.tomorrow
  const first = t.outTheDoor && p.anchors.morning
    ? [...(p.kids[0]?.morning ?? [])].filter((r) => minutesOf(r.timeOfDay) != null).sort((a, b) => (minutesOf(a.timeOfDay) ?? 0) - (minutesOf(b.timeOfDay) ?? 0))[0] ?? null
    : null
  const lead = t.outTheDoor ? null : p.weekend.tomorrow[0] ?? null
  const also = p.weekend.tomorrow.filter((r) => r !== lead).slice(0, 3)
  return (
    <div className="kv-night">
      <section className="kv-night-lead" aria-label="Tomorrow">
        <p className="kv-lab">Tomorrow · {t.label}</p>
        {t.outTheDoor
          ? <div className="kv-hero"><b>{t.outTheDoor}</b><small>am</small></div>
          : lead ? <div className="kv-hero"><b>{lead.time.replace(/[ap]$/, '')}</b><small>{lead.time.endsWith('p') ? 'pm' : 'am'}</small></div> : null}
        {t.outTheDoor ? <p className="kv-hero-sub">Out the door</p>
          : lead ? <p className="kv-hero-sub">{lead.title}</p>
          : <p className="kv-hero-sub is-quiet">Nothing set for the morning yet.</p>}
        {t.specials.length > 0 && (
          <div className="kv-specials">
            {t.specials.map((s) => (
              <span key={s.member.id}><Face member={s.member} size="md" /><span><small>{s.member.name}</small><b>{s.text}</b></span></span>
            ))}
          </div>
        )}
        {p.talks.length > 0 && (
          <button type="button" className="kv-talk-line" onClick={p.places.onNotes}>
            <MessageSquare aria-hidden="true" />
            <span><b>{p.talks.length === 1 ? '1 thing' : `${p.talks.length} things`} to talk about</b><small>{p.talks.slice(0, 3).map((x) => x.text).join(' · ')}</small></span>
            <ChevronRight aria-hidden="true" className="kv-go" />
          </button>
        )}
      </section>
      {(first || also.length > 0) && (
        <aside className="kv-night-side" aria-label="Also tomorrow">
          {first && p.anchors.morning && (
            <div>
              <p className="kv-lab">First thing</p>
              <div className="kv-side-time"><b>{clockLabel(minutesOf(first.timeOfDay) ?? p.anchors.morning.start)}</b><small>am</small></div>
              <p className="kv-side-sub">{first.title}</p>
            </div>
          )}
          {also.length > 0 && (
            <div>
              <p className="kv-lab">Also tomorrow</p>
              <ul className="kv-times">
                {also.map((r) => <li key={r.id}><b>{r.time}</b><span>{r.title}</span></li>)}
              </ul>
            </div>
          )}
        </aside>
      )}
    </div>
  )
}

/** A weekend day in hours: blocks with the faces of who's in them. */
function Weekend(p: KioskHomeV1Props) {
  const day = new Date(p.now); day.setHours(0, 0, 0, 0)
  const startH = 7, endH = 21, span = (endH - startH) * 60
  const pos = (d: Date) => ((d.getHours() * 60 + d.getMinutes() - startH * 60) / span) * 100
  const blocks = p.weekend.rows.flatMap((r) => {
    const at = r.startsAt != null ? new Date(r.startsAt) : parseWallClock(r.time, day)
    if (!at) return []
    const end = r.endsAt != null ? new Date(r.endsAt) : new Date(at.getTime() + 45 * 60_000)
    const left = Math.max(0, pos(at)), right = Math.min(100, pos(end))
    if (right <= 0 || left >= 100) return []
    return [{ r, left, width: Math.max(5, right - left) }]
  })
  // Overlapping blocks stack into lanes so each stays readable.
  const lanes: { end: number }[] = []
  const placed = blocks.sort((a, b) => a.left - b.left).map((b) => {
    let lane = lanes.findIndex((l) => l.end <= b.left)
    if (lane < 0) { lane = lanes.length; lanes.push({ end: 0 }) }
    lanes[lane].end = b.left + b.width
    return { ...b, lane }
  })
  const laneH = 100 / Math.max(1, lanes.length)
  const nowPos = pos(p.now)
  return (
    <div className="kv-scene is-weekend">
      <div className="kv-weekend">
        <section className="kv-card kv-hours" aria-label="Today, hour by hour">
          <div className="kv-hour-ticks" aria-hidden="true">
            {Array.from({ length: endH - startH }, (_, i) => <span key={i}>{((startH + i) % 12) || 12}</span>)}
          </div>
          <div className="kv-hour-track">
            {placed.map(({ r, left, width, lane }) => (
              <button key={r.id} type="button" onClick={() => p.onTapRow(r.id)}
                className={`kv-block ${r.now ? 'is-now' : r.past ? 'is-past' : ''}`}
                style={{ left: `${left}%`, width: `${width}%`, top: `${lane * laneH}%`, height: `calc(${laneH}% - 10px)` }}>
                <small>{r.time}{r.end ? `–${r.end}` : ''}</small>
                <b>{r.title}</b>
                <Faces ids={r.owners} members={p.members} />
              </button>
            ))}
            {placed.length === 0 && <p className="kv-quiet kv-hour-empty">Nothing on the clock today. A free day.</p>}
            {nowPos > 0 && nowPos < 100 && <span className="kv-now-line" style={{ left: `${nowPos}%` }} aria-hidden="true" />}
          </div>
        </section>
        <div className="kv-row is-short">
          <section className="kv-card kv-grow" aria-label="Sometime today">
            <p className="kv-lab">Sometime today</p>
            <div className="kv-tags">
              {p.weekend.anytime.map((a) => <span key={a.title} className="kv-tag is-task">{a.title}<Faces ids={a.owners} members={p.members} /></span>)}
              {p.weekend.anytime.length === 0 && <p className="kv-quiet">Nothing else today.</p>}
            </div>
          </section>
          <section className="kv-card kv-side" aria-label="Tomorrow">
            <p className="kv-lab">Tomorrow · {p.weekend.tomorrowLabel}</p>
            <ul className="kv-list">
              {p.weekend.tomorrow.slice(0, 4).map((r) => <li key={r.id}><b>{r.time}</b> {r.title}<Faces ids={r.owners} members={p.members} /></li>)}
              {p.weekend.tomorrow.length === 0 && <li className="kv-quiet">Nothing on the clock yet.</li>}
            </ul>
          </section>
        </div>
        <Places places={p.places} />
      </div>
    </div>
  )
}

export function KioskHomeV1(p: KioskHomeV1Props) {
  switch (p.pick.screen) {
    case 'out-the-door': return <OutTheDoor {...p} />
    case 'home': return <HomeFromSchool {...p} />
    case 'dinner': return <Dinner {...p} />
    case 'bedtime': return <Bedtime {...p} />
    case 'night': return <Night {...p} />
    case 'weekend': return <Weekend {...p} />
    default: return <Rest {...p} />
  }
}

export { SHARED as KV_SHARED }
