// The kiosk's Home stage by part of the day, laid out as the approved boards
// (Kiosk-Morning, -Afternoon, -Evening, -Between). Same data the wall always
// had — today's privacy-filtered rows, each kid's morning list / after-school
// work / routine, tonight's dinner — composed per daypart:
//
//   morning    Out the door (wide, left) · Today + Morning routine (right)
//   afternoon  Who needs to be where (wide, left) · After school + Before dinner
//   evening    Dinner (wide, left) · Tonight + Bedtime   (after 7:30: Bedtime
//              takes the wide card; Tonight + Tomorrow on the right)
//   between    scenery, with three small cards along the bottom
//
// A card with nothing to show keeps its place and says so in one calm line,
// so the layout never reshuffles with the data.

import type { ReactNode } from 'react'
import { Check, ChefHat, ChevronRight } from 'lucide-react'
import type { FamilyMember } from '@/types/family'
import type { WallTodayRow, WallChecklist } from '@/lib/wall/wallMomentsModel'
import type { KidRow } from '@/lib/wall/kidDayModel'
import type { ComingUpRow } from '../wallStrip'
import type { MomentKid, MomentHandoff } from '../moments/WallMoments'
import { buildPeopleLanes, laneWindow, tonightRows, upcomingRows, parseWallClock, type KioskComposition, type NextCommitment } from '@/lib/wall/activity/kioskCompose'
import { countdownLabel, type BedtimeGrid, type DepartureModel } from '@/lib/wall/activity/kioskRoutines'
import { Photo, type KioskDinner } from './KioskStages'

export interface KioskHomeProps {
  comp: KioskComposition
  now: Date
  members: FamilyMember[]
  rows: WallTodayRow[]
  kidsNow: MomentKid[]
  focusRows: WallTodayRow[]
  handoffs: MomentHandoff[]
  checklists: { member: FamilyMember; list: WallChecklist | null; live?: string | null }[]
  dinner: KioskDinner | null
  nextMeal: { label: string; title: string; imageUrl: string | null; onOpen?: () => void } | null
  comingUp: ComingUpRow[]
  question: { text: string; isHandoff: boolean } | null
  bedtime: BedtimeGrid
  departure: DepartureModel
  next: NextCommitment | null
  onTapRow: (id: string) => void
  onTick: (member: FamilyMember, row: KidRow) => void
  onToggleDeparture: (key: string) => void
  onOpenKid: (member: FamilyMember) => void
  onClaim: () => void
  onTapQuestion: () => void
  onOpenDinner: () => void
  onStartCooking: () => void
  onStartDeparture: () => void
  onStartBedtime: () => void
}

const hm = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/, '')

function Card({ label, children, className = '', aria }: { label: string; children: ReactNode; className?: string; aria?: string }) {
  return (
    <section className={`kc-card ${className}`} aria-label={aria ?? label}>
      <p className="kc-lab">{label}</p>
      {children}
    </section>
  )
}

function Calm({ children }: { children: ReactNode }) {
  return <p className="kc-quiet-line">{children}</p>
}

function Avatar({ name, tone }: { name: string; tone: number }) {
  return <span className={`kc-av tone-${tone % 4}`} aria-hidden="true">{name.slice(0, 1)}</span>
}

function EventRows({ rows, members, onTapRow }: { rows: WallTodayRow[]; members: FamilyMember[]; onTapRow: (id: string) => void }) {
  return (
    <ul>
      {rows.map((r) => {
        const who = r.owners.map((id) => members.find((m) => m.id === id)?.name).filter(Boolean).join(' & ')
        return (
          <li key={r.id}>
            <button type="button" className={`kc-ev ${r.now ? 'is-now' : ''}`} onClick={() => onTapRow(r.id)}>
              <b>{r.time}</b><span>{r.title}{who && ` · ${who}`}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function TickRow({ done, label, sub, onClick }: { done: boolean; label: string; sub?: string | null; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={done} className={`kc-ing ${done ? 'is-have' : ''}`} onClick={onClick}>
      <span className="kc-box" aria-hidden="true">{done && <Check />}</span>
      <span className="kc-ing-name">{label}</span>
      {sub && <span className="kc-sub-right">{sub}</span>}
    </button>
  )
}

function BedtimeRows({ grid, onStart }: { grid: BedtimeGrid; onStart: () => void }) {
  if (grid.people.length === 0) return <Calm>No bedtime routine tonight.</Calm>
  return (
    <ul>
      {grid.people.map((p, idx) => {
        const mine = grid.steps.map((s) => s.cells.find((c) => c.memberId === p.id)?.row).filter((r): r is KidRow => !!r)
        const done = mine.filter((r) => r.done).length
        return (
          <li key={p.id}>
            <button type="button" className="kc-ing" onClick={onStart} aria-label={`${p.name}: ${done} of ${mine.length} bedtime steps. Open bedtime`}>
              <Avatar name={p.name} tone={idx} />
              <span className="kc-ing-name">{p.name}</span>
              <span className="kc-meter" style={{ ['--kc-progress' as string]: `${mine.length ? (done / mine.length) * 100 : 0}%` }} aria-hidden="true" />
              <span className="kc-sub-right">{done} of {mine.length}</span>
              <ChevronRight aria-hidden="true" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function KioskHome(p: KioskHomeProps) {
  const { comp, now, members } = p
  const kidTone = (id: string) => Math.max(0, p.checklists.findIndex((c) => c.member.id === id))

  if (comp.hero === 'out-the-door') {
    const dep = p.departure
    const kids = p.checklists.filter((c) => c.list && c.list.rows.length > 0)
    return (
      <div className="kc-compose kc-cols-morning">
        <Card label="Out the door" className="kc-otd">
          {dep.at
            ? <div className="kc-hero-time"><b>{hm(dep.at)}</b><span>{dep.atLabel?.replace(/ at \S+$/, '')} · {countdownLabel(dep.at, now)}</span></div>
            : <Calm>No departures planned this morning.</Calm>}
          <div className="kc-people-grid">
            {dep.people.map((person) => {
              const member = members.find((m) => m.id === person.memberId)
              return (
                <div key={person.memberId}>
                  <button type="button" className="kc-person" onClick={() => member && p.onOpenKid(member)}><Avatar name={person.name} tone={kidTone(person.memberId)} />{person.name}</button>
                  {person.items.length === 0 && <Calm>Nothing to bring.</Calm>}
                  <ul>{person.items.map((it) => <li key={it.key}><TickRow done={it.done} label={it.text} onClick={() => p.onToggleDeparture(it.key)} /></li>)}</ul>
                </div>
              )
            })}
          </div>
          <div className="kc-card-foot"><button type="button" className="kc-btn" onClick={p.onStartDeparture}>Get ready to leave</button></div>
        </Card>
        <div className="kc-stack">
          <Card label="Today">
            {upcomingRows(p.rows, 4).length ? <EventRows rows={upcomingRows(p.rows, 4)} members={members} onTapRow={p.onTapRow} /> : <Calm>Nothing on the clock today.</Calm>}
          </Card>
          <Card label="Morning routine">
            {kids.length === 0 && <Calm>No morning routine today.</Calm>}
            {kids.map(({ member, list }) => (
              <div key={member.id} className="kc-who">
                <button type="button" className="kc-person is-small" onClick={() => p.onOpenKid(member)}><Avatar name={member.name} tone={kidTone(member.id)} />{member.name}</button>
                <div className="kc-steps">
                  {list!.rows.slice(0, 6).map((r) => (
                    <button key={`${r.entityType}:${r.id}`} type="button" aria-pressed={r.done} className={`kc-st ${r.done ? 'is-done' : ''}`} onClick={() => p.onTick(member, r)}>
                      {r.done && <Check aria-hidden="true" />}{r.title}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    )
  }

  if (comp.hero === 'lanes') {
    const win = laneWindow(now)
    const lanes = buildPeopleLanes(p.rows, members, now, win)
    const nowLeft = ((now.getTime() - win.start.getTime()) / (win.end.getTime() - win.start.getTime())) * 100
    const after = p.kidsNow.flatMap((k) => k.afterSchool.map((r) => ({ k, r })))
    const dinnerAt = p.dinner?.at ?? new Date(now).setHours(18, 0, 0, 0)
    const before = p.rows.filter((r) => {
      const at = r.startsAt ?? parseWallClock(r.time, now)?.getTime() ?? 0
      return !r.past && r.kind !== 'event' && at < dinnerAt
    })
    return (
      <div className="kc-compose kc-cols-afternoon">
        <Card label="Who needs to be where" className="kc-lanes-card">
          {lanes.length === 0 ? <Calm>Everyone’s home for the rest of the day.</Calm> : (
            <div className="kc-lanes">
              <div className="kc-lane-axis" aria-hidden="true">{win.ticks.map((t) => <span key={t.label} style={{ left: `${t.left}%` }}>{t.label}</span>)}</div>
              {lanes.map((l) => {
                const kid = l.memberId ? p.checklists.find((c) => c.member.id === l.memberId)?.member : null
                const name = <><Avatar name={l.name} tone={l.memberId ? kidTone(l.memberId) : 3} />{l.name}</>
                return (
                  <div key={l.memberId ?? 'household'} className="kc-lane">
                    {kid ? <button type="button" className="kc-lane-name" onClick={() => p.onOpenKid(kid)}>{name}</button> : <span className="kc-lane-name">{name}</span>}
                    <div className="kc-lane-track">
                      <span className="kc-lane-now" style={{ left: `${nowLeft}%` }} aria-hidden="true" />
                      {l.blocks.map((b) => (
                        <button key={b.id} type="button" className={`kc-block ${l.memberId ? '' : 'is-home'} ${b.now ? 'is-now' : ''}`} style={{ left: `${b.left}%`, width: `${b.width}%` }} onClick={() => p.onTapRow(b.id)}>
                          <strong>{b.title}</strong><small>{b.sub ?? b.time}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
        <div className="kc-stack">
          <Card label="After school">
            {p.handoffs.map((h) => (
              <div key={h.key} className="kc-handoff">
                <span><b>{h.time}</b> {h.prompt}<small>Nobody has this yet</small></span>
                <button type="button" className="kc-btn is-accent" onClick={p.onClaim}>Who’s got it?</button>
              </div>
            ))}
            {after.length === 0 && p.handoffs.length === 0 && <Calm>No homework or practice today.</Calm>}
            <ul>{after.map(({ k, r }) => <li key={`${k.member.id}:${r.entityType}:${r.id}`}><TickRow done={r.done} label={r.title} sub={k.member.name} onClick={() => p.onTick(k.member, r)} /></li>)}</ul>
          </Card>
          <Card label="Before dinner">
            {before.length === 0 && !p.dinner?.cue && <Calm>Nothing to do before dinner.</Calm>}
            <ul>
              {p.dinner?.cue && <li><div className="kc-ing is-static"><span className="kc-ing-name">{p.dinner.cue}</span><span className="kc-sub-right">{p.dinner.title}</span></div></li>}
              {before.map((r) => <li key={r.id}><button type="button" className="kc-ev" onClick={() => p.onTapRow(r.id)}><b>{r.time}</b><span>{r.title}</span></button></li>)}
            </ul>
          </Card>
        </div>
      </div>
    )
  }

  if (comp.hero === 'dinner' || comp.hero === 'bedtime') {
    const tonight = tonightRows(p.rows, now)
    const tonightCard = (
      <Card label="Tonight">
        {tonight.length ? <EventRows rows={tonight} members={members} onTapRow={p.onTapRow} /> : <Calm>Nothing else on tonight.</Calm>}
      </Card>
    )
    if (comp.hero === 'dinner') {
      const d = p.dinner
      return (
        <div className="kc-compose kc-cols-evening">
          <Card label={d?.timeLabel ? d.timeLabel.replace(/^Dinner at /, 'Dinner · ') : 'Dinner'} className="kc-meal-card" aria="Dinner">
            {d ? (
              <div className="kc-meal">
                <button type="button" className="kc-meal-photo" onClick={p.onOpenDinner} aria-label={`${d.title}: servings and ingredients`}><Photo url={d.imageUrl} /></button>
                <div className="kc-meal-text">
                  <h2 className="kc-h1">{d.title}</h2>
                  <p className="kc-facts">{[d.minutes ? `${d.minutes} min` : null, `Serves ${d.baseServes}`].filter(Boolean).join(' · ')}</p>
                  <div className="kc-acts">
                    {d.source && <button type="button" className="kc-btn kc-big is-accent" onClick={p.onStartCooking}>Start cooking</button>}
                    <button type="button" className="kc-btn kc-big" onClick={p.onOpenDinner}>Ingredients</button>
                  </div>
                </div>
              </div>
            ) : <Calm>No dinner planned tonight.</Calm>}
          </Card>
          <div className="kc-stack">
            {tonightCard}
            <Card label="Bedtime"><BedtimeRows grid={p.bedtime} onStart={p.onStartBedtime} /></Card>
          </div>
        </div>
      )
    }
    return (
      <div className="kc-compose kc-cols-evening">
        <Card label="Bedtime" className="kc-meal-card">
          <BedtimeRows grid={p.bedtime} onStart={p.onStartBedtime} />
          {p.bedtime.people.length > 0 && <div className="kc-card-foot"><button type="button" className="kc-btn kc-big is-accent" onClick={p.onStartBedtime}>{p.bedtime.done > 0 ? 'Carry on with bedtime' : 'Start bedtime'}</button></div>}
        </Card>
        <div className="kc-stack">
          {tonightCard}
          <Card label="Tomorrow">
            {(() => {
              const lines = p.kidsNow.flatMap((k) => {
                const l = [...(k.special ? [`${k.special} tomorrow`] : []), ...k.needed.map((n) => `Bring: ${n}`), ...k.homeworkDue.map((h) => `Homework: ${h}`)]
                return l.length ? [{ k, text: l.join(' · ') }] : []
              })
              if (!lines.length && !p.focusRows.length && !p.nextMeal) return <Calm>Nothing to get ready for tomorrow.</Calm>
              return (
                <ul>
                  {lines.map(({ k, text }) => <li key={k.member.id}><div className="kc-ing is-static"><span className="kc-ing-name">{text}</span><span className="kc-sub-right">{k.member.name}</span></div></li>)}
                  {p.focusRows.map((r) => <li key={r.id}><button type="button" className="kc-ev" onClick={() => p.onTapRow(r.id)}><b>{r.time}</b><span>{r.title}</span></button></li>)}
                  {p.nextMeal && <li><div className="kc-ing is-static"><span className="kc-ing-name">{p.nextMeal.title}</span><span className="kc-sub-right">{p.nextMeal.label}</span></div></li>}
                </ul>
              )
            })()}
          </Card>
        </div>
      </div>
    )
  }

  // Between busy times (board: Kiosk-Between): scenery, three small cards.
  const later = p.comingUp[0]
  return (
    <div className="kc-compose kc-between">
      <div className="kc-band">
        <section className="kc-card kc-small-card" aria-label="Next up">
          <p className="kc-lab">Next up</p>
          {p.next ? <><b>{p.next.time} · {p.next.title}</b><span>{p.next.owners.map((id) => members.find((m) => m.id === id)?.name).filter(Boolean).join(' & ') || 'Household'}</span></> : <><b>Nothing else today</b><span>A quiet day at home</span></>}
        </section>
        {p.nextMeal?.onOpen
          ? <button type="button" className="kc-card kc-small-card" onClick={p.nextMeal.onOpen} aria-label={`${p.nextMeal.label}: ${p.nextMeal.title}`}>
              <p className="kc-lab">{p.nextMeal.label}</p><b>{p.nextMeal.title}</b><span><ChefHat aria-hidden="true" />Recipe</span>
            </button>
          : p.nextMeal
            ? <section className="kc-card kc-small-card" aria-label={p.nextMeal.label}><p className="kc-lab">{p.nextMeal.label}</p><b>{p.nextMeal.title}</b></section>
          : <section className="kc-card kc-small-card" aria-label="Dinner"><p className="kc-lab">Dinner</p><b>Not planned yet</b><span>Plan it from the app</span></section>}
        {later
          ? <section className="kc-card kc-small-card" aria-label="Coming up"><p className="kc-lab">Coming up · {later.dayLabel}</p><b>{later.summary}</b>{p.comingUp[1] && <span>{p.comingUp[1].dayLabel} · {p.comingUp[1].summary}</span>}</section>
          : p.question
            ? <button type="button" className="kc-card kc-small-card" onClick={p.onTapQuestion}><p className="kc-lab">{p.question.isHandoff ? 'Who’s on?' : 'Question of the day'}</p><b className="is-quote">{p.question.text}</b></button>
            : <section className="kc-card kc-small-card" aria-label="Coming up"><p className="kc-lab">Coming up</p><b>A quiet week ahead</b></section>}
      </div>
    </div>
  )
}
