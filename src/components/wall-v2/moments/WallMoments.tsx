// The wall, by time of day (Scott, 2026-10-04 — "it's beautiful, ship it";
// mockup "Wall, by time of day"). One screen that changes through the day:
//
//   header   greeting for the part of the day, the date, the clock, weather
//   left     Today — today's timed things, past ones faded, today's specials
//   centre   the moment: out the door · after school · dinner · tomorrow
//   right    this week's school specials per kid, and what's coming up
//   bottom   the question of the day, and each kid's checklist for now
//
// Data-free: the Shell hands everything in, already projected.
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Check, Clock, ChefHat, ShoppingCart, Home, ChevronRight } from 'lucide-react'
import type { FamilyMember } from '@/types/family'
import type { WallMoment } from '@/lib/wall/wallMoment'
import type { WallTodayRow, SpecialsDay, WallChecklist } from '@/lib/wall/wallMomentsModel'
import type { KidRow } from '@/lib/wall/kidDayModel'
import type { ComingUpRow } from '../wallStrip'

export interface MomentKid {
  member: FamilyMember
  special: string | null
  hint: string | null
  /** Things to bring / needed (today in the morning, tomorrow in the evening). */
  needed: string[]
  homeworkDue: string[]
}

export interface MomentHandoff { key: string; time: string; prompt: string }

export interface MomentDinner {
  title: string
  imageUrl: string | null
  minutes: number | null
  cue: string | null
  ingredients: string[]
  hasRecipe: boolean
  scale: number
  onScale: (n: number) => void
  onCook: () => void
  have: Set<number>
  onToggleHave: (i: number) => void
  onAddMissing: () => void
}

export interface WallMomentsProps {
  moment: WallMoment
  dateLabel: string
  clock: string
  weather: { icon: LucideIcon; temp: number; condition: string } | null
  freshness?: ReactNode
  actions?: ReactNode
  members: FamilyMember[]
  kids: FamilyMember[]
  today: WallTodayRow[]
  specials: SpecialsDay[]
  comingUp: ComingUpRow[]
  /** Morning and evening: each kid's specials, things to bring. */
  kidsNow: MomentKid[]
  /** Morning: the adults' morning. After: the rest of the afternoon. Evening: tomorrow's morning. */
  focusRows: WallTodayRow[]
  handoffs: MomentHandoff[]
  dinner: MomentDinner | null
  /** Morning/after: tonight's dinner in a line. Evening: tomorrow's. */
  nextMeal: { label: string; title: string; imageUrl: string | null } | null
  question: { text: string; isHandoff: boolean } | null
  checklists: { member: FamilyMember; list: WallChecklist | null; live?: string | null }[]
  onTapRow: (id: string) => void
  onClaim: () => void
  onTapQuestion: () => void
  onTick: (member: FamilyMember, row: KidRow) => void
  onOpenKid: (member: FamilyMember) => void
}

const GREETING: Record<WallMoment, string> = { morning: 'Good morning', after: 'Good afternoon', dinner: 'Good evening', evening: 'Good evening' }

// Person tints: hue and lightness both differ, so the chips read apart.
const TINTS = ['bg-[#2b4a7a] text-[#d8e6ff]', 'bg-[#53347a] text-[#efdcff]', 'bg-[#7a2f4b] text-[#ffdbe7]', 'bg-[#24603f] text-[#d6f5e3]', 'bg-[#6b4a14] text-[#ffe9bf]', 'bg-[#1f5a63] text-[#d3f3f7]']
const BARS = ['#4f86d9', '#9c6bd9', '#d9668d', '#4fb37f', '#d9a24f', '#4fb3c2']

function useTint(members: FamilyMember[]) {
  const idx = new Map(members.map((m, i) => [m.id, i % TINTS.length]))
  return {
    chip: (id: string) => TINTS[idx.get(id) ?? 0],
    bar: (ids: string[]) => (ids.length === 1 ? BARS[idx.get(ids[0]) ?? 0] : ids.length > 1 ? '#8a6bd1' : '#6c7c8f'),
    initial: (id: string) => {
      const m = members.find((x) => x.id === id)
      return (m?.initials || m?.name?.[0] || '?').slice(0, 2).toUpperCase()
    },
    name: (id: string) => members.find((x) => x.id === id)?.name ?? '',
  }
}

const card = 'rounded-[22px] border border-[#273444] bg-[#17212c]'
const h2 = 'font-display text-[2.2rem] leading-[1.1] font-medium text-[#f3f5f8] m-0'
const kicker = 'text-[0.95rem] font-semibold uppercase tracking-[0.12em] text-[#93a3b5]'

function Chip({ id, t, size = 'md' }: { id: string; t: ReturnType<typeof useTint>; size?: 'sm' | 'md' }) {
  return (
    <span aria-label={t.name(id)} className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${size === 'sm' ? 'h-8 w-8 text-[0.8rem]' : 'h-10 w-10 text-[0.9rem]'} ${t.chip(id)}`}>
      {t.initial(id)}
    </span>
  )
}

function Photo({ url, className = '' }: { url: string | null; className?: string }) {
  return url
    ? <img src={url} alt="" className={`object-cover ${className}`} />
    // No photo yet: a warm plate-coloured field rather than a broken image.
    : <div aria-hidden="true" className={`flex items-start justify-end p-3 ${className}`}
        style={{ background: 'linear-gradient(135deg,#6b3b1f 0%,#b5652c 38%,#e0a24f 62%,#6e8b3d 100%)' }}><ChefHat className="h-7 w-7 text-white/35" /></div>
}

function TodayColumn({ rows, specials, kids, t, onTapRow }: { rows: WallTodayRow[]; specials: SpecialsDay | null; kids: FamilyMember[]; t: ReturnType<typeof useTint>; onTapRow: (id: string) => void }) {
  return (
    <section aria-label="Today" className={`${card} flex min-h-0 flex-col px-7 py-6`}>
      <h2 className={h2}>Today</h2>
      {specials && specials.cells.some((c) => c.text) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {specials.cells.filter((c) => c.text).map((c) => (
            <span key={c.memberId} className={`rounded-full px-3.5 py-1.5 text-[1.05rem] font-semibold ${t.chip(c.memberId)}`}>
              {kids.find((k) => k.id === c.memberId)?.name} · {c.text}
            </span>
          ))}
        </div>
      )}
      <ul className="mt-2 min-h-0 flex-1 overflow-hidden">
        {rows.length === 0 && <li className="py-4 font-display text-[1.4rem] italic text-[#8d9cad]">Nothing on the clock today.</li>}
        {rows.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => onTapRow(r.id)}
              className={`grid w-full grid-cols-[96px_6px_minmax(0,1fr)_auto] items-center gap-x-4 border-b border-[#223041] py-3 text-left ${r.past ? 'opacity-40' : ''}`}>
              <span className="text-[1.25rem] leading-tight tabular-nums text-[#c3cfdb]">{r.time}{r.end && <small className="block text-[0.95rem] text-[#7f8fa1]">{r.end}</small>}</span>
              <span className="h-11 w-1.5 rounded-full" style={{ background: t.bar(r.owners) }} />
              <span className="min-w-0">
                <span className={`block truncate text-[1.45rem] font-medium leading-tight ${r.now ? 'text-[#ffd28a]' : 'text-[#eef2f6]'}`}>{r.title}</span>
                {r.sub && <span className="block truncate text-[1rem] text-[#8d9cad]">{r.sub}</span>}
              </span>
              <span className="flex gap-1">{r.owners.slice(0, 3).map((id) => <Chip key={id} id={id} t={t} />)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function RowList({ rows, t, onTapRow }: { rows: WallTodayRow[]; t: ReturnType<typeof useTint>; onTapRow: (id: string) => void }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.id}>
          <button type="button" onClick={() => onTapRow(r.id)} className="grid w-full grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl bg-[#1d2835] px-5 py-3.5 text-left">
            <span className="text-[1.3rem] tabular-nums text-[#c3cfdb]">{r.time}</span>
            <span className="min-w-0"><span className="block truncate text-[1.45rem] font-medium text-[#eef2f6]">{r.title}</span>{r.sub && <span className="block truncate text-[1rem] text-[#8d9cad]">{r.sub}</span>}</span>
            <span className="flex gap-1">{r.owners.slice(0, 3).map((id) => <Chip key={id} id={id} t={t} />)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function KidBring({ kids, t, label }: { kids: MomentKid[]; t: ReturnType<typeof useTint>; label: (k: MomentKid) => string[] }) {
  const shown = kids.filter((k) => label(k).length)
  if (!shown.length) return null
  return (
    <div className={`grid gap-4 ${shown.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {shown.map((k) => (
        <div key={k.member.id} className="rounded-2xl bg-[#1d2835] px-5 py-4">
          <div className="mb-2 flex items-center gap-3"><Chip id={k.member.id} t={t} /><span className="text-[1.5rem] font-semibold">{k.member.name}</span></div>
          {label(k).map((line, i) => <div key={i} className="py-1.5 text-[1.3rem] leading-snug text-[#dfe7ef]">{line}</div>)}
        </div>
      ))}
    </div>
  )
}

function NextMeal({ meal }: { meal: NonNullable<WallMomentsProps['nextMeal']> }) {
  return (
    <div className="mt-auto flex items-center gap-4 rounded-2xl bg-[#1d2835] p-4">
      <Photo url={meal.imageUrl} className="h-[84px] w-[132px] shrink-0 rounded-xl" />
      <div className="min-w-0"><div className={kicker}>{meal.label}</div><div className="mt-1 truncate font-display text-[1.7rem] text-white">{meal.title}</div></div>
    </div>
  )
}

function DinnerCard({ d }: { d: MomentDinner }) {
  return (
    <>
      <div className="relative h-[34%] min-h-[220px] overflow-hidden rounded-[18px]">
        <Photo url={d.imageUrl} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-black/85 to-transparent px-6 pb-5 pt-16">
          <div className="min-w-0">
            <div className="font-display text-[2.6rem] leading-[1.05] text-white">{d.title}</div>
            {d.minutes && <div className="mt-1 text-[1.1rem] text-[#e7e2d8]">{d.minutes} min</div>}
          </div>
          {d.hasRecipe && (
            <button type="button" onClick={d.onCook} className="inline-flex min-h-[60px] shrink-0 items-center gap-2 rounded-2xl bg-[#f2b65a] px-6 text-[1.2rem] font-semibold text-[#1b1406]">
              Cook from the recipe <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
      {d.cue && (
        <div className="flex items-center gap-3 rounded-2xl bg-[#3a2c12] px-5 py-3.5 text-[1.3rem] font-semibold text-[#ffd894]">
          <Clock className="h-7 w-7 shrink-0" />{d.cue}
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_240px] gap-5">
        <ul className="grid min-h-0 grid-cols-2 content-start gap-x-4 overflow-hidden">
          {d.ingredients.map((line, i) => {
            const have = d.have.has(i)
            return (
              <li key={i}>
                <button type="button" aria-pressed={have} onClick={() => d.onToggleHave(i)} className="flex min-h-[48px] w-full items-center gap-3 py-1 text-left">
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 ${have ? 'border-[#5fbf8b] bg-[#5fbf8b]' : 'border-[#5d6f83]'}`}>{have && <Check className="h-4 w-4 text-[#0e151d]" strokeWidth={3} />}</span>
                  <span className={`text-[1.15rem] leading-snug ${have ? 'text-[#7f8fa1] line-through' : 'text-[#dfe7ef]'}`}>{line}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <div className="flex flex-col gap-3">
          <div className={kicker}>Making it</div>
          <div className="flex gap-2" role="group" aria-label="Scale the recipe">
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" aria-pressed={d.scale === n} onClick={() => d.onScale(n)}
                className={`min-h-[60px] flex-1 rounded-2xl border text-[1.3rem] font-semibold ${d.scale === n ? 'border-[#f2b65a] bg-[#f2b65a] text-[#1b1406]' : 'border-[#33465b] bg-[#1f2b38] text-[#e6edf4]'}`}>×{n}</button>
            ))}
          </div>
          <button type="button" onClick={d.onAddMissing} className="inline-flex min-h-[60px] items-center justify-center gap-2 rounded-2xl border border-[#33465b] bg-[#1f2b38] px-4 text-[1.1rem] font-semibold text-[#e6edf4]">
            <ShoppingCart className="h-5 w-5" />Add missing to shopping
          </button>
        </div>
      </div>
    </>
  )
}

function Center(p: WallMomentsProps & { t: ReturnType<typeof useTint> }) {
  const { moment, t } = p
  if (moment === 'dinner' && p.dinner) {
    return <><h2 className={h2} style={{ fontSize: '2.7rem' }}>Dinner tonight</h2><DinnerCard d={p.dinner} /></>
  }
  if (moment === 'evening') {
    return (
      <>
        <h2 className={h2} style={{ fontSize: '2.7rem' }}>Tomorrow</h2>
        <KidBring kids={p.kidsNow} t={t} label={(k) => [
          ...(k.special ? [`${k.special} tomorrow${k.hint ? ` — ${k.hint}` : ''}`] : []),
          ...k.needed.map((n) => `Bring: ${n}`),
          ...k.homeworkDue.map((h) => `Homework: ${h}`),
        ]} />
        {p.focusRows.length > 0 && <div className="flex flex-col gap-2"><div className={kicker}>Tomorrow morning</div><RowList rows={p.focusRows} t={t} onTapRow={p.onTapRow} /></div>}
        {p.nextMeal && <NextMeal meal={p.nextMeal} />}
      </>
    )
  }
  if (moment === 'morning') {
    return (
      <>
        <h2 className={h2} style={{ fontSize: '2.7rem' }}>Out the door</h2>
        <KidBring kids={p.kidsNow} t={t} label={(k) => [
          ...(k.special ? [`${k.special} today${k.hint ? ` — ${k.hint}` : ''}`] : []),
          ...k.needed.map((n) => `Bring: ${n}`),
          ...k.homeworkDue.map((h) => `Homework due: ${h}`),
        ]} />
        {p.focusRows.length > 0 && <div className="flex flex-col gap-2"><div className={kicker}>This morning</div><RowList rows={p.focusRows} t={t} onTapRow={p.onTapRow} /></div>}
        {p.kidsNow.every((k) => !k.special && !k.needed.length && !k.homeworkDue.length) && p.focusRows.length === 0 && (
          <p className="font-display text-[1.6rem] italic text-[#8d9cad]">A quiet morning.</p>
        )}
        {p.nextMeal && <NextMeal meal={p.nextMeal} />}
      </>
    )
  }
  // After school (and any daytime hour that isn't dinner yet).
  return (
    <>
      <h2 className={h2} style={{ fontSize: '2.7rem' }}>{p.handoffs.length || p.focusRows.length ? 'This afternoon' : 'The rest of today'}</h2>
      {p.handoffs.map((h) => (
        <div key={h.key} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border border-[#5a4520] bg-[#2a2316] px-5 py-3.5">
          <span className="text-[1.3rem] tabular-nums text-[#ffd894]">{h.time}</span>
          <span className="min-w-0"><span className="block text-[1.45rem] font-medium text-[#fff1d6]">{h.prompt}</span><span className="block text-[1rem] text-[#c9a86b]">Nobody has this yet</span></span>
          <button type="button" onClick={p.onClaim} className="min-h-[60px] rounded-2xl bg-[#f2b65a] px-6 text-[1.2rem] font-semibold text-[#1b1406]">Who’s got it?</button>
        </div>
      ))}
      {p.focusRows.length > 0 ? <RowList rows={p.focusRows} t={t} onTapRow={p.onTapRow} />
        : !p.handoffs.length && <p className="font-display text-[1.6rem] italic text-[#8d9cad]">Nothing more on the clock before dinner.</p>}
      {p.nextMeal && <NextMeal meal={p.nextMeal} />}
    </>
  )
}

export function WallMoments(p: WallMomentsProps) {
  const t = useTint(p.members)
  const todaySpecials = p.specials.find((s) => s.isToday) ?? null
  const lit = p.moment === 'evening' ? (p.specials.find((s) => s.isTomorrow)?.key ?? null) : todaySpecials?.key ?? null
  const W = p.weather
  return (
    <div className="flex h-full min-h-0 flex-col gap-5 px-9 pb-6 pt-7 font-sans text-[#e8edf2]"
      style={{ background: 'radial-gradient(1200px 380px at 78% -6%, #2a3a52 0%, rgba(42,58,82,0) 70%), #0e151d' }}>
      <header className="flex items-end justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-4 text-[0.95rem] font-semibold tracking-[0.22em] text-[#a9b7c6]">SYMPHONY {p.freshness}</div>
          <h1 className="m-0 mt-1 font-display text-[3.6rem] font-medium leading-none text-[#f6f7f9]">{GREETING[p.moment]}</h1>
        </div>
        <div className="flex items-center gap-7 text-[1.9rem] text-[#e9eef4]">
          <span>{p.dateLabel}</span>
          <span className="font-semibold tabular-nums">{p.clock}</span>
          {W && <span className="inline-flex items-center gap-2"><W.icon className="h-8 w-8 text-[#f2c06b]" aria-hidden="true" />{Math.round(W.temp)}°</span>}
          {p.actions}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,31fr)_minmax(0,42fr)_minmax(0,27fr)] gap-5">
        <TodayColumn rows={p.today} specials={todaySpecials} kids={p.kids} t={t} onTapRow={p.onTapRow} />

        <section aria-label="Now" className={`${card} flex min-h-0 flex-col gap-4 overflow-hidden px-8 py-6`}>
          <Center {...p} t={t} />
        </section>

        <div className="flex min-h-0 flex-col gap-5">
          {p.specials.length > 0 && (
            <section aria-label="Specials this week" className={`${card} px-6 py-5`}>
              <div className="mb-2 flex items-baseline justify-between"><h2 className={h2} style={{ fontSize: '1.9rem' }}>Specials</h2><span className="text-[1rem] text-[#93a3b5]">this week</span></div>
              <table className="w-full border-separate border-spacing-y-0.5 text-[1.15rem]">
                <thead><tr><th className="w-14" />{p.kids.map((k) => <th key={k.id} className="px-2 py-1 text-left text-[1rem] font-semibold text-[#c9d4df]">{k.name}</th>)}</tr></thead>
                <tbody>
                  {p.specials.map((s) => (
                    <tr key={s.key} className={s.key === lit ? 'bg-[#243245] text-white' : 'text-[#cdd7e1]'}>
                      <td className="rounded-l-lg px-2 py-1.5 font-semibold">{s.day}</td>
                      {s.cells.map((c, i) => <td key={c.memberId} className={`px-2 py-1.5 ${i === s.cells.length - 1 ? 'rounded-r-lg' : ''}`}>{c.text}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          <section aria-label="Coming up" className={`${card} min-h-0 flex-1 overflow-hidden px-6 py-5`}>
            <h2 className={h2} style={{ fontSize: '1.9rem' }}>Coming up</h2>
            <ul className="mt-1">
              {p.comingUp.map((c) => (
                <li key={c.dateKey} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 border-b border-[#223041] py-2.5">
                  <span className="text-[1.05rem] font-semibold text-[#93a3b5]">{c.dayLabel}</span>
                  <span className="text-[1.15rem] leading-snug text-[#eef2f6]">{c.summary}</span>
                </li>
              ))}
              {p.comingUp.length === 0 && <li className="py-3 font-display text-[1.3rem] italic text-[#8d9cad]">A quiet week ahead.</li>}
            </ul>
          </section>
        </div>
      </div>

      <footer className={`${card} grid min-h-[150px] shrink-0 grid-cols-[minmax(0,1fr)_1px_minmax(0,1.45fr)] items-center gap-7 px-8 py-4`}>
        <button type="button" onClick={p.onTapQuestion} className="min-w-0 text-left">
          <div className={kicker}>{p.question?.isHandoff ? 'Who’s on?' : 'Question of the day'}</div>
          <div className="mt-1 line-clamp-2 font-display text-[1.8rem] italic leading-tight text-[#f3eee4]">{p.question?.text ?? 'Ask each other about the best part of today.'}</div>
        </button>
        <div className="h-[90px] bg-[#2a3747]" />
        <div className={`grid gap-4 ${p.checklists.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {p.checklists.map(({ member, list, live }) => (
            <div key={member.id} className="min-w-0 rounded-2xl border border-[#2d3d50] bg-[#1c2733] px-4 py-3">
              <button type="button" onClick={() => p.onOpenKid(member)} className="flex min-h-[44px] w-full items-center gap-3 text-left">
                <Chip id={member.id} t={t} /><span className="text-[1.35rem] font-semibold">{member.name}</span>
                <span className="truncate text-[1rem] text-[#93a3b5]">{live ?? list?.title ?? 'Nothing right now'}</span>
                <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-[#93a3b5]" />
              </button>
              {list && (
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {list.rows.slice(0, 4).map((r) => (
                    <button key={`${r.entityType}:${r.id}`} type="button" aria-pressed={r.done} onClick={() => p.onTick(member, r)}
                      className={`inline-flex min-h-[44px] max-w-full items-center gap-1.5 truncate rounded-full px-4 text-[1.05rem] ${r.done ? 'bg-[#1d3a2b] text-[#9fd8b5] line-through' : 'bg-[#202c39] text-[#d6dfe8]'}`}>
                      {r.done && <Check className="h-4 w-4" strokeWidth={3} />}{r.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {p.checklists.length === 0 && <div className="flex items-center gap-3 text-[1.2rem] text-[#93a3b5]"><Home className="h-6 w-6" />No checklists right now.</div>}
        </div>
      </footer>
    </div>
  )
}
