// The kitchen wall's Home. Version 1 (Scott, 2026-10-13) chose one screen at
// a time from the household's routines (kioskScreen); Kitchen wall v2 (the
// mockup Scott approved 2026-10-14, stage 1) gives every moment the same
// frame: a lead column and a quiet side column split by a hairline, the side
// column's timeline rows, Fraunces for what matters and Instrument Sans for
// the rest.
//
//   out-the-door   full stage: the time and what's left · the grown-ups'
//                  line · each kid's checklist (done steps fold to one line;
//                  the step's icon is its check)
//   rest           the next landmark, large · dinner · notes for the house ·
//                  the places · the rest of today and tomorrow beside it
//   home           each kid's after-school steps · dinner and what's next
//   dinner         tonight's dinner · the question of the day beside it
//   bedtime        steps × kids · lights out as a ring · tomorrow
//   night          tomorrow's one time, large · who has what · talk-abouts ·
//                  the first thing and the rest of tomorrow beside it
//   weekend        what's on now · sometime today · the rest of the day
//
// More takes the side column (`aside`): the lead stays, dimmed. Presentation
// only: the Shell owns data, permissions and writes. Lists are limited so
// nothing scrolls at 1920×1080.

import { createElement, useState, type ReactNode } from 'react'
import {
  Check, ChevronRight, ShoppingCart, BookOpen, Phone, StickyNote, ChefHat, MessageSquare, Shirt, ShoppingBasket, BedDouble,
  Smile, Utensils, Sparkles, Backpack, Footprints, CircleCheck, Folder, Calculator, ShowerHead, BookOpenText, type LucideIcon,
} from 'lucide-react'
import type { FamilyMember } from '@/types/family'
import type { KidRow } from '@/lib/wall/kidDayModel'
import type { WallTodayRow } from '@/lib/wall/wallMomentsModel'
import type { BedtimeGrid } from '@/lib/wall/activity/kioskRoutines'
import { minutesOf, type DayAnchors, type KioskScreenPick } from '@/lib/wall/activity/kioskScreen'
import { Photo, type KioskDinner } from './KioskStages'

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
  /** More, in place of the side column (Kitchen wall v2). */
  aside?: ReactNode
}

const SHARED = '__shared'

/** A person: their colour and initial, the same everywhere on the wall. */
export function Face({ member, size = 'md' }: { member: Pick<FamilyMember, 'name' | 'initials' | 'color'> | undefined; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  if (!member) return null
  return (
    <span className={`kv-face is-${size}`} style={{ background: member.color || undefined }} aria-hidden="true">
      {(member.initials || member.name.slice(0, 1)).slice(0, 1)}
    </span>
  )
}

const clockLabel = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}`
}
const nowMin = (d: Date) => d.getHours() * 60 + d.getMinutes()
/** "4:15p" / "6p" → "4:15" / "6:00": the side column's times. */
const tlTime = (t: string) => {
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])?/i)
  return m ? `${m[1]}:${m[2] ?? '00'}` : t
}
const namesOf = (ids: string[] | undefined, members: FamilyMember[]) =>
  (ids ?? []).map((id) => members.find((m) => m.id === id)?.name).filter((n): n is string => !!n)
const byOf = (r: WallTodayRow, members: FamilyMember[]) => r.sub ?? (namesOf(r.owners, members).join(' & ') || null)

/** A step's picture, from the words in it; a plain circle-check otherwise.
 *  Order matters: "Dirty clothes in the hamper" is laundry, not dressing;
 *  "Clear the breakfast dishes" is clearing, not eating; "Bag packed:
 *  homework folder" is the bag. */
const STEP_ICONS: [RegExp, LucideIcon][] = [
  [/\b(hamper|laundry)\b/i, ShoppingBasket],
  [/\b(dish(es)?|clear)\b/i, Sparkles],
  [/\b(dress(ed)?|clothes|outfit|uniform|pajamas|pyjamas|pjs)\b/i, Shirt],
  [/\b(shower|bath)\b/i, ShowerHead],
  [/\b(teeth|tooth|brush)\b/i, Smile],
  [/\b(read|reading|book)\b/i, BookOpenText],
  [/\b(bed|room|tidy)\b/i, BedDouble],
  [/\b(breakfast|eat|lunch|snack)\b/i, Utensils],
  [/\b(bag|backpack)\b/i, Backpack],
  [/\b(shoes?|jacket|coat|boots)\b/i, Footprints],
  [/\b(folder)\b/i, Folder],
  [/\b(math|maths)\b/i, Calculator],
]
export function stepIcon(title: string): LucideIcon {
  return STEP_ICONS.find(([re]) => re.test(title))?.[1] ?? CircleCheck
}

function isForKid(row: KidRow, kidId: string) {
  return !row.by || row.by.length === 0 || row.by.includes(kidId)
}

/** A step's own time: one without its own inherits the routine's start, so
 *  a time equal to the start is no time of its own. */
const ownTime = (row: KidRow, startsAt: number | null) => {
  const t = minutesOf(row.timeOfDay)
  return t != null && t !== startsAt ? t : null
}
/** "Bag packed: homework folder, …" — the row says the step; the bag says what. */
const shortTitle = (title: string) => title.split(':')[0].trim() || title

// ─── The frame's pieces ──────────────────────────────────────────────────

/** Lead · hairline · side column. With `aside`, More takes the side column
 *  and the lead stays, dimmed; a full-stage moment gives up ~45% to it. */
function Stage({ lead, side, sideLabel, aside, full, label }: { lead: ReactNode; side?: ReactNode; sideLabel?: string; aside?: ReactNode; full?: boolean; label: string }) {
  if (aside) {
    return (
      <div className={`kw-stage is-more ${full ? 'was-full' : ''}`}>
        <section className="kw-col is-dim" aria-label={label}>{lead}</section>
        <div className="kw-vr" aria-hidden="true" />
        <div className="kw-col">{aside}</div>
      </div>
    )
  }
  if (full || !side) return <div className="kw-stage is-full"><section className="kw-col" aria-label={label}>{lead}</section></div>
  return (
    <div className="kw-stage">
      <section className="kw-col" aria-label={label}>{lead}</section>
      <div className="kw-vr" aria-hidden="true" />
      <aside className="kw-col kw-side" aria-label={sideLabel}>{side}</aside>
    </div>
  )
}

/** A timeline row in the side column; a button when it opens something. */
function Tl({ t, w, by, onTap }: { t: string; w: string; by?: string | null; onTap?: () => void }) {
  const body = <><span className="kw-tl-t">{t}</span><span className="kw-tl-w"><span>{w}</span>{by && <span className="kw-tl-by">{by}</span>}</span></>
  return onTap
    ? <button type="button" className="kw-tl" onClick={onTap}>{body}</button>
    : <div className="kw-tl">{body}</div>
}

function TodayRows({ rows, p, max }: { rows: WallTodayRow[]; p: KioskHomeV1Props; max: number }) {
  return <>{rows.slice(0, max).map((r) => <Tl key={r.id} t={tlTime(r.time)} w={r.title} by={byOf(r, p.members)} onTap={() => p.onTapRow(r.id)} />)}</>
}

/** Time left as a ring: full when the window opens, empty when it closes. */
function Arc({ frac, size, stroke, children }: { frac: number; size: number; stroke: number; children?: ReactNode }) {
  const r = 50 - stroke / 2 - 1
  const c = 2 * Math.PI * r
  const f = Math.min(1, Math.max(0, frac))
  return (
    <div className="kw-arc" style={{ width: `calc(${size} * var(--p))`, height: `calc(${size} * var(--p))` }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} className="kw-arc-track" strokeWidth={stroke} />
        <circle cx="50" cy="50" r={r} className="kw-arc-fill" strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - f)} transform="rotate(-90 50 50)" />
      </svg>
      {children && <div className="kw-arc-label">{children}</div>}
    </div>
  )
}

/** A checklist row: the step's icon is its check (Scott, 2026-10-14). Done,
 *  the circle fills sage and shows a check; the whole row is the toggle. */
function StepRow({ row, next, startsAt, extra, onTick }: { row: KidRow; next: boolean; startsAt?: number | null; extra?: string; onTick: () => void }) {
  const own = startsAt === undefined ? null : ownTime(row, startsAt)
  const short = shortTitle(row.title)
  return (
    <button type="button" onClick={onTick} aria-label={`Mark ${short} ${row.done ? 'not done' : 'done'}`}
      className={`kw-ck ${row.done ? 'is-done' : next ? 'is-next' : ''}`}>
      <span className="kw-ck-c" aria-hidden="true">{createElement(row.done ? Check : stepIcon(row.title))}</span>
      <span className="kw-ck-t"><span>{short}</span>{extra && <small>{extra}</small>}</span>
      {next ? <span className="kw-ck-tag">NEXT</span> : own != null ? <span className="kw-ck-time">{clockLabel(own)}</span> : <span />}
    </button>
  )
}

/** Done steps fold into one line; a tap opens them so one can be unticked. */
function DoneLine({ rows, open, onToggle }: { rows: KidRow[]; open: boolean; onToggle: () => void }) {
  if (!rows.length) return null
  return (
    <button type="button" className="kw-ck is-done is-fold" onClick={onToggle} aria-expanded={open}
      aria-label={open ? 'Hide the done steps' : `Done: ${rows.map((r) => shortTitle(r.title)).join(', ')}. Show them`}>
      <span className="kw-ck-c" aria-hidden="true"><Check /></span>
      <span className="kw-ck-t"><span>{open ? 'Done · tap a step to undo it' : rows.map((r) => shortTitle(r.title)).join(' · ')}</span></span>
      <span />
    </button>
  )
}

/** One kid's checklist: done steps folded, the rest in order; at most `max`
 *  rows counting the folded line, so nothing scrolls (the count in the
 *  kid's heading says how many are left). */
function KidChecklist({ kid, steps, startsAt, bag, max, onTick }: { kid: FamilyMember; steps: KidRow[]; startsAt?: number | null; bag?: string[]; max: number; onTick: (r: KidRow) => void }) {
  const [open, setOpen] = useState(false)
  const done = steps.filter((r) => r.done)
  const todo = steps.filter((r) => !r.done)
  const next = todo[0]
  const bagRow = bag?.length ? steps.find((r) => stepIcon(r.title) === Backpack) : undefined
  const room = Math.max(1, max - (done.length ? 1 : 0))
  const shown = open ? [...done, ...todo].slice(0, room) : todo.slice(0, room)
  return (
    <div className="kw-ck-list" role="group" aria-label={`${kid.name}'s steps`}>
      <DoneLine rows={done} open={open} onToggle={() => setOpen((o) => !o)} />
      {shown.map((r) => (
        <StepRow key={r.id} row={r} next={r === next} startsAt={startsAt}
          extra={r === bagRow ? bag!.join(' · ') : undefined} onTick={() => onTick(r)} />
      ))}
      {steps.length === 0 && <p className="kw-quiet">Nothing on {kid.name}'s list.</p>}
    </div>
  )
}

function KidHead({ kid, meta, count, onOpen }: { kid: FamilyMember; meta?: string | null; count: string; onOpen: () => void }) {
  return (
    <button type="button" className="kw-kid-head" onClick={onOpen}>
      <Face member={kid} size="lg" />
      <span className="kw-grow"><b>{kid.name}</b>{meta && <small>{meta}</small>}</span>
      <span className="kw-meta">{count}</span>
    </button>
  )
}

// ─── The moments ────────────────────────────────────────────────────────

/** Getting ready for school (OutTheDoor.dc.html): the time and what's left,
 *  the grown-ups' line, each kid's checklist. */
function OutTheDoor(p: KioskHomeV1Props) {
  const end = p.anchors.morning?.end ?? 0
  const start = p.anchors.morning?.start ?? end - 35
  const startsAt = p.anchors.morning?.start ?? null
  const left = Math.max(0, end - nowMin(p.now))
  const total = end - start + 15
  const kidIds = p.kids.map((k) => k.member.id)
  // The grown-ups' steps: the ones that name only people who aren't kids.
  const seen = new Set<string>()
  const grownUps = p.kids.flatMap((k) => k.morning)
    .filter((r) => r.by?.length && !r.by.some((id) => kidIds.includes(id)))
    .filter((r) => { const key = `${r.title}|${r.timeOfDay}`; if (seen.has(r.id) || seen.has(key)) return false; seen.add(r.id); seen.add(key); return true })
    .sort((a, b) => (minutesOf(a.timeOfDay) ?? 0) - (minutesOf(b.timeOfDay) ?? 0))
    .slice(0, 4)
  const lead = (
    <div className="kw-otd">
      <header className="kw-otd-head">
        <h2 className="kw-serif">Out the door at {clockLabel(end)}</h2>
        <span className="kw-grow" />
        <Arc frac={total > 0 ? left / total : 0} size={84} stroke={11} />
        {left > 0
          ? <span className="kw-otd-left" aria-label="Time left"><b className="kw-serif">{left}</b> <span>{left === 1 ? 'minute' : 'minutes'}</span></span>
          : <span className="kw-otd-left" aria-label="Time left"><b className="kw-serif is-word">Time to go</b></span>}
      </header>
      {grownUps.length > 0 && (
        <ul className="kw-grown" aria-label="Grown-ups this morning">
          {grownUps.map((row) => (
            <li key={row.id} className={row.done ? 'is-done' : ''}>
              {(row.by ?? []).slice(0, 2).map((id) => <Face key={id} member={p.members.find((m) => m.id === id)} size="xs" />)}
              <span>{row.timeOfDay ? `${clockLabel(minutesOf(row.timeOfDay) ?? 0)} ` : ''}{row.title}</span>
              <span className="sr-only">{namesOf(row.by, p.members).join(' & ')}</span>
              {row.done && <Check aria-label="done" />}
            </li>
          ))}
        </ul>
      )}
      <div className="kw-otd-kids" style={{ ['--kids' as string]: Math.max(1, Math.min(3, p.kids.length)) }}>
        {p.kids.slice(0, 3).map((k) => {
          const steps = k.morning.filter((r) => isForKid(r, k.member.id))
          const done = steps.filter((r) => r.done).length
          return (
            <section key={k.member.id} className="kw-otd-kid" aria-label={`${k.member.name}'s morning`}>
              <KidHead kid={k.member} meta={k.special ? `${k.special} today` : null} count={`${done} of ${steps.length}`} onOpen={() => p.onOpenKid(k.member)} />
              <KidChecklist kid={k.member} steps={steps} startsAt={startsAt} bag={k.bag} max={5} onTick={(r) => p.onTick(k.member, r)} />
              {k.bag.length > 0 && !steps.some((r) => stepIcon(r.title) === Backpack) && <p className="kw-meta">In the bag: {k.bag.join(' · ')}</p>}
            </section>
          )
        })}
      </div>
    </div>
  )
  return <Stage full lead={lead} aside={p.aside} label="Getting ready for school" />
}

function Places({ places }: { places: KioskHomeV1Props['places'] }) {
  const item = (label: string, Icon: LucideIcon, onClick: () => void) => (
    <button type="button" className="kw-btn is-place" onClick={onClick}><Icon aria-hidden="true" />{label}</button>
  )
  return (
    <nav className="kw-places" aria-label="Places">
      {item('Groceries', ShoppingCart, places.onGroceries)}
      {item('Recipes', BookOpen, places.onRecipes)}
      {item('Call', Phone, places.onCall)}
      {item('Notes', StickyNote, places.onNotes)}
    </nav>
  )
}

/** A quiet stretch (Main.dc.html): the next landmark, large; the rest of
 *  today and tomorrow in the side column. */
function Rest(p: KioskHomeV1Props) {
  const [hero, ...rest] = p.restLine.split(' · ')
  const lede = rest.join(' · ') || p.restSub
  const today = p.weekend.rows.filter((r) => !r.past)
  // Five timeline rows fit beside the lead, tomorrow's included.
  const todayMax = p.weekend.tomorrow.length ? 4 : 5
  const tomorrow = p.weekend.tomorrow.slice(0, Math.max(1, 5 - Math.min(today.length, todayMax)))
  const lead = (
    <>
      <p className="kw-eyebrow">Today</p>
      <h2 className={`kw-hero ${hero.length > 30 ? 'is-long' : ''}`}>{hero}</h2>
      {lede && <p className="kw-lede is-muted">{lede}</p>}
      <span className="kw-grow" />
      {p.notes.length > 0 && (
        <ul className="kw-notes" aria-label="Notes for the house">
          {p.notes.slice(0, 2).map((n, i) => (
            <li key={n.id} className="kw-note" style={{ ['--tilt' as string]: `${[-1.5, 1][i]}deg` }}>
              <p>{n.text}</p>{n.by && <small>{n.by}</small>}
            </li>
          ))}
        </ul>
      )}
      <Places places={p.places} />
    </>
  )
  const side = (
    <>
      <p className="kw-eyebrow kw-side-lab">The rest of today</p>
      <TodayRows rows={today} p={p} max={todayMax} />
      {today.length === 0 && <p className="kw-quiet">Nothing else on the clock today.</p>}
      {tomorrow.length > 0 && (
        <>
          <p className="kw-eyebrow kw-side-lab is-gap">Tomorrow</p>
          {tomorrow.map((r) => <Tl key={r.id} t={tlTime(r.time)} w={r.title} by={byOf(r, p.members)} />)}
        </>
      )}
    </>
  )
  return <Stage lead={lead} side={side} sideLabel="The rest of today" aside={p.aside} label="Today" />
}

/** Dinner in the side column: what, when, and the way in. */
function DinnerSide({ p, after }: { p: KioskHomeV1Props; after: WallTodayRow[] }) {
  const d = p.dinner
  return (
    <>
      <p className="kw-eyebrow">{d?.timeLabel ?? 'Dinner'}</p>
      {d ? (
        <>
          <p className="kw-lede kw-side-title">{d.title}</p>
          {d.cue && <p className="kw-meta">{d.cue}</p>}
          {(d.key || d.hasRecipe) && (
            <div className="kw-acts">
              {d.key && <button type="button" className="kw-btn is-primary" onClick={p.onStartCooking}><ChefHat aria-hidden="true" />Start cooking</button>}
              {d.hasRecipe && <button type="button" className="kw-btn is-quiet" onClick={p.onOpenRecipe}>Recipe</button>}
            </div>
          )}
        </>
      ) : <p className="kw-quiet">Nothing planned yet.</p>}
      <TodayRows rows={after} p={p} max={3} />
    </>
  )
}

/** Home from school (HomeFromSchool.dc.html): each kid's steps · dinner. */
function HomeFromSchool(p: KioskHomeV1Props) {
  const lead = (
    <>
      <p className="kw-eyebrow">After school</p>
      <div className="kw-kids" style={{ ['--kids' as string]: Math.max(1, Math.min(3, p.kids.length)) }}>
        {p.kids.slice(0, 3).map((k) => {
          const rows = k.after.filter((r) => isForKid(r, k.member.id))
          const done = rows.filter((r) => r.done).length
          return (
            <section key={k.member.id} className="kw-kid" aria-label={`${k.member.name} after school`}>
              <KidHead kid={k.member} count={`${done} of ${rows.length}`} onOpen={() => p.onOpenKid(k.member)} />
              <KidChecklist kid={k.member} steps={rows} max={5} onTick={(r) => p.onTick(k.member, r)} />
            </section>
          )
        })}
      </div>
    </>
  )
  const after = p.weekend.rows.filter((r) => !r.past && !/dinner/i.test(r.title))
  return <Stage lead={lead} side={<DinnerSide p={p} after={after} />} sideLabel="Dinner" aside={p.aside} label="After school" />
}

/** Dinner (Dinner.dc.html): tonight's dinner leads; the question of the day
 *  sits in the side column, large. */
function Dinner(p: KioskHomeV1Props) {
  const d = p.dinner
  const t = nowMin(p.now)
  const after = p.weekend.rows.filter((r) => !r.past && r.startsAt != null && nowMin(new Date(r.startsAt)) > t + 30 && !/dinner/i.test(r.title))
  const lead = d ? (
    <>
      {d.imageUrl && (
        <button type="button" className="kw-photo" onClick={d.hasRecipe ? p.onOpenRecipe : undefined} aria-label={d.hasRecipe ? `${d.title}: open the recipe` : d.title}>
          <Photo url={d.imageUrl} />
        </button>
      )}
      <p className="kw-eyebrow">{d.timeLabel ?? 'Tonight'}</p>
      <h2 className={`kw-serif kw-dinner-title ${d.imageUrl ? '' : 'is-big'}`}>{d.title}</h2>
      {d.minutes && <p className="kw-sub">{d.minutes} minutes to make{d.ingredients.length ? ` · ${d.ingredients.length} ingredients` : ''}</p>}
      {d.cue && <p className="kw-meta kw-cue">{d.cue}</p>}
      <span className="kw-grow" />
      <div className="kw-acts">
        {d.hasRecipe && <button type="button" className="kw-btn is-primary" onClick={p.onOpenRecipe}><BookOpen aria-hidden="true" />Open the recipe</button>}
        {d.key && <button type="button" className={`kw-btn ${d.hasRecipe ? 'is-quiet' : 'is-primary'}`} onClick={p.onStartCooking}><ChefHat aria-hidden="true" />Step by step</button>}
        {d.ingredients.length > 0 && <button type="button" className="kw-btn is-quiet" onClick={p.onAddMissing}><ShoppingCart aria-hidden="true" />What's missing</button>}
      </div>
    </>
  ) : (
    <>
      <p className="kw-eyebrow">Tonight</p>
      <h2 className="kw-serif kw-dinner-title is-big">No dinner planned tonight</h2>
    </>
  )
  const side = (
    <>
      <p className="kw-eyebrow is-sym">Question of the day</p>
      {p.question ? <p className="kw-question">{p.question}</p> : <p className="kw-quiet">No question today.</p>}
      {p.onAnotherQuestion && <button type="button" className="kw-btn is-quiet kw-another" onClick={p.onAnotherQuestion}>Another question</button>}
      <span className="kw-grow" />
      {after.length > 0 && <p className="kw-eyebrow kw-side-lab">After dinner</p>}
      <TodayRows rows={after} p={p} max={2} />
    </>
  )
  return <Stage lead={lead} side={side} sideLabel="Question of the day" aside={p.aside} label="Tonight's dinner" />
}

/** Bedtime (Bedtime.dc.html): steps × kids, lights out as a ring, tomorrow. */
function Bedtime(p: KioskHomeV1Props) {
  const g = p.bedtime
  const end = p.anchors.bedtime.end
  const left = Math.max(0, end - nowMin(p.now))
  const span = Math.max(1, end - p.anchors.bedtime.start)
  const people = g.people.slice(0, 3)
  const current = g.steps.find((s) => s.cells.some((c) => c.row && !c.row.done))?.key
  // Six rows fit; past that, steps everyone has finished give way first.
  const MAX = 6
  let steps = g.steps
  if (steps.length > MAX) {
    const open = steps.filter((s) => s.cells.some((c) => c.row && !c.row.done))
    const keep = open.length >= MAX ? open.slice(0, MAX) : [...steps.filter((s) => !open.includes(s)).slice(-(MAX - open.length)), ...open]
    steps = g.steps.filter((s) => keep.includes(s))
  }
  const lead = people.length === 0 ? <p className="kw-quiet">No bedtime routine tonight.</p> : (
    <div className="kw-bed" style={{ ['--cols' as string]: people.length }}>
      <p className="kw-eyebrow kw-bed-lab">{g.title} · {g.done} of {g.total}</p>
      {people.map((who) => (
        <span key={who.id} className="kw-bed-who"><Face member={p.members.find((m) => m.id === who.id) ?? { name: who.name, initials: who.name.slice(0, 1), color: '' } as FamilyMember} size="lg" /><span className="kw-meta">{who.name}</span></span>
      ))}
      {steps.map((s) => (
        <div key={s.key} className="kw-bed-row" role="group" aria-label={s.title}>
          <span className="kw-bed-s">{createElement(stepIcon(s.title), { 'aria-hidden': true })}{s.title}</span>
          {s.cells.filter((c) => people.some((x) => x.id === c.memberId)).map((c) => {
            const name = g.people.find((x) => x.id === c.memberId)?.name ?? ''
            return (
              <span key={c.memberId} className="kw-bed-cell">
                {c.row
                  ? <button type="button" aria-pressed={c.row.done} aria-label={`${name}: ${s.title}`}
                      className={`kw-bed-c ${c.row.done ? 'is-done' : s.key === current ? 'is-now' : ''}`} onClick={() => { const m = p.members.find((x) => x.id === c.memberId); if (m) p.onTick(m, c.row!) }}>
                      {c.row.done && <Check aria-hidden="true" />}
                    </button>
                  : <span className="kw-bed-na" role="img" aria-label={`${name}: not in their routine`} />}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
  const specials = p.tomorrow.specials.map((s) => `${s.member.name}: ${s.text}`).join(' · ')
  const side = (
    <>
      <p className="kw-eyebrow">Lights out</p>
      <Arc frac={left / span} size={300} stroke={5}>
        <span className="kw-serif kw-arc-big">{clockLabel(end)}</span>
        <span className="kw-meta">{left > 0 ? `in ${left} minute${left === 1 ? '' : 's'}` : 'now'}</span>
      </Arc>
      <p className="kw-eyebrow kw-side-lab">Tomorrow</p>
      {p.tomorrow.outTheDoor && <Tl t={p.tomorrow.outTheDoor} w="Out the door" by={specials || null} />}
      {p.weekend.tomorrow.slice(0, p.tomorrow.outTheDoor ? 1 : 2).map((r) => <Tl key={r.id} t={tlTime(r.time)} w={r.title} by={byOf(r, p.members)} />)}
      {!p.tomorrow.outTheDoor && p.weekend.tomorrow.length === 0 && <p className="kw-quiet">Nothing on the clock yet.</p>}
    </>
  )
  return <Stage lead={lead} side={side} sideLabel="Lights out" aside={p.aside} label="Bedtime" />
}

/** Night (Night.dc.html): tomorrow's one time, large; who has what; the
 *  first thing in the morning and the rest of tomorrow beside it. */
function Night(p: KioskHomeV1Props) {
  const t = p.tomorrow
  const first = t.outTheDoor && p.anchors.morning
    ? [...(p.kids[0]?.morning ?? [])].filter((r) => minutesOf(r.timeOfDay) != null).sort((a, b) => (minutesOf(a.timeOfDay) ?? 0) - (minutesOf(b.timeOfDay) ?? 0))[0] ?? null
    : null
  const lead0 = t.outTheDoor ? null : p.weekend.tomorrow[0] ?? null
  const also = p.weekend.tomorrow.filter((r) => r !== lead0).slice(0, 3)
  const big = t.outTheDoor ?? (lead0 ? tlTime(lead0.time) : null)
  const ampm = t.outTheDoor ? 'am' : lead0 ? (/p/i.test(lead0.time) ? 'pm' : 'am') : ''
  const lead = (
    <>
      <p className="kw-eyebrow">Tomorrow · {t.label}</p>
      {big && <div className="kw-night-time"><b className="kw-serif">{big}</b><small>{ampm}</small></div>}
      <p className={`kw-night-what ${big ? '' : 'is-quiet'}`}>{t.outTheDoor ? 'Out the door' : lead0 ? lead0.title : 'Nothing set for the morning yet.'}</p>
      {t.specials.length > 0 && (
        <div className="kw-specials">
          {t.specials.slice(0, 3).map((s) => (
            <span key={s.member.id} className="kw-who"><Face member={s.member} size="lg" /><span><small>{s.member.name}</small><b>{s.text}</b></span></span>
          ))}
        </div>
      )}
      <span className="kw-grow" />
      {p.talks.length > 0 && (
        <button type="button" className="kw-btn is-quiet kw-talks" onClick={p.places.onNotes}>
          <MessageSquare aria-hidden="true" />
          <span><b>{p.talks.length === 1 ? '1 thing' : `${p.talks.length} things`} to talk about</b><small>{p.talks.slice(0, 3).map((x) => x.text).join(' · ')}</small></span>
          <ChevronRight aria-hidden="true" />
        </button>
      )}
    </>
  )
  const side = (first || also.length > 0) ? (
    <>
      {first && p.anchors.morning && (
        <>
          <p className="kw-eyebrow">First thing</p>
          <div className="kw-first"><b className="kw-serif">{clockLabel(minutesOf(first.timeOfDay) ?? p.anchors.morning.start)}</b><small>am</small></div>
          <p className="kw-first-what">{first.title}{first.by?.length ? <span className="kw-muted"> · {namesOf(first.by, p.members).join(' & ')}</span> : null}</p>
        </>
      )}
      {also.length > 0 && (
        <>
          <p className={`kw-eyebrow kw-side-lab ${first ? 'is-gap-lg' : ''}`}>Also tomorrow</p>
          {also.map((r) => <Tl key={r.id} t={tlTime(r.time)} w={r.title} by={byOf(r, p.members)} />)}
        </>
      )}
    </>
  ) : null
  return <Stage lead={lead} side={side} sideLabel="Also tomorrow" aside={p.aside} label="Tomorrow" />
}

/** A weekend day (Saturday.dc.html): what's on now, sometime today, and the
 *  rest of the day beside it. */
function Weekend(p: KioskHomeV1Props) {
  const rows = p.weekend.rows
  const lead0 = rows.find((r) => r.now && !r.past) ?? rows.find((r) => !r.past) ?? null
  const later = rows.filter((r) => !r.past && r !== lead0)
  const until = lead0?.endsAt ? new Date(lead0.endsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '') : null
  const anytime = p.weekend.anytime.slice(0, 6)
  const lead = (
    <>
      {lead0 ? (
        <>
          <p className={`kw-eyebrow ${lead0.now ? 'is-now' : ''}`}>{lead0.now && <span className="kw-dot" aria-hidden="true" />}{lead0.now ? `Now${until ? ` · until ${until}` : ''}` : `Next · ${tlTime(lead0.time)}`}</p>
          <h2 className={`kw-hero is-weekend ${lead0.title.length > 26 ? 'is-long' : ''}`}>{lead0.title}</h2>
          {lead0.sub && <p className="kw-sub">{lead0.sub}</p>}
          {lead0.owners.length > 0 && (
            <div className="kw-people">
              {lead0.owners.slice(0, 5).map((id) => { const m = p.members.find((x) => x.id === id); return m ? <span key={id} className="kw-who"><Face member={m} size="sm" />{m.name}</span> : null })}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="kw-eyebrow">Today</p>
          <h2 className="kw-hero is-weekend">A free day</h2>
          <p className="kw-sub">Nothing on the clock today.</p>
        </>
      )}
      <span className="kw-grow" />
      <div className="kw-anytime-head"><span className="kw-eyebrow">Sometime today</span><span className="kw-meta">{p.weekend.anytime.length ? `${p.weekend.anytime.length} to do` : 'Nothing else today'}</span></div>
      {anytime.length > 0 && (
        <ul className="kw-anytime" aria-label="Sometime today">
          {anytime.map((a) => (
            <li key={a.title}><span className="kw-anytime-dot" aria-hidden="true" /><span>{a.title}{a.owners.length > 0 && <small>{namesOf(a.owners, p.members).join(' & ')}</small>}</span></li>
          ))}
        </ul>
      )}
    </>
  )
  const side = (
    <>
      <p className="kw-eyebrow kw-side-lab">Later today</p>
      <TodayRows rows={later} p={p} max={p.weekend.tomorrow.length ? 3 : 5} />
      {later.length === 0 && <p className="kw-quiet">Nothing else on the calendar.</p>}
      {p.weekend.tomorrow.length > 0 && (
        <>
          <p className="kw-eyebrow kw-side-lab is-gap">Tomorrow · {p.weekend.tomorrowLabel}</p>
          {p.weekend.tomorrow.slice(0, Math.max(1, 4 - Math.min(3, later.length))).map((r) => <Tl key={r.id} t={tlTime(r.time)} w={r.title} by={byOf(r, p.members)} />)}
        </>
      )}
    </>
  )
  return <Stage lead={lead} side={side} sideLabel="Later today" aside={p.aside} label="Today" />
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
