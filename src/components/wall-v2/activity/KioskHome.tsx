// The kiosk's Home stage by part of the day (conversational canvas,
// slice 7). Same data the wall always had — today's privacy-filtered rows,
// each kid's morning list / after-school work / checklist, tonight's
// dinner, the scratchpad, the question — composed per daypart:
//
//   morning    Out the door (per kid) · Today · the morning routine
//   afternoon  Who's where (lanes) · After school · Before dinner
//   evening    Dinner (hero) or Bedtime (hero) · Tonight · Tomorrow
//   quiet      scenery first, three small cards
//
// The composition for a daypart never changes shape while it's showing.

import type { ReactNode } from 'react'
import { ArrowRight, Check, ChefHat, MessageCircle, Moon, Footprints, Users } from 'lucide-react'
import type { FamilyMember } from '@/types/family'
import type { WallTodayRow, WallChecklist } from '@/lib/wall/wallMomentsModel'
import type { KidRow } from '@/lib/wall/kidDayModel'
import type { ComingUpRow } from '../wallStrip'
import type { MomentKid, MomentHandoff } from '../moments/WallMoments'
import type { MomentScratchpad } from '../moments/ScratchpadCard'
import { buildPeopleLanes, laneWindow, tonightRows, upcomingRows, type KioskComposition } from '@/lib/wall/activity/kioskCompose'
import type { BedtimeGrid } from '@/lib/wall/activity/kioskRoutines'
import type { KioskDinner } from './KioskStages'

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
  scratchpad: MomentScratchpad
  question: { text: string; isHandoff: boolean } | null
  bedtime: BedtimeGrid
  /** Household tools (kidsPhone, Groceries, Recipes, …) */
  tools: ReactNode
  onTapRow: (id: string) => void
  onTick: (member: FamilyMember, row: KidRow) => void
  onOpenKid: (member: FamilyMember) => void
  onClaim: () => void
  onTapQuestion: () => void
  onOpenDinner: () => void
  onStartCooking: () => void
  onStartDeparture: () => void
  onStartBedtime: () => void
}

function Rows({ rows, members, onTapRow, empty }: { rows: WallTodayRow[]; members: FamilyMember[]; onTapRow: (id: string) => void; empty: string }) {
  if (!rows.length) return <p className="kc-muted kc-quiet-line">{empty}</p>
  return (
    <ul className="kc-rows">
      {rows.map((r) => (
        <li key={r.id}>
          <button type="button" className={`kc-row ${r.now ? 'is-now' : ''}`} onClick={() => onTapRow(r.id)}>
            <time>{r.time}{r.end && <small>{r.end}</small>}</time>
            <span><strong>{r.title}</strong>{(r.sub || r.owners.length > 0) && <small>{[r.sub, r.owners.map((id) => members.find((m) => m.id === id)?.name).filter(Boolean).join(' · ')].filter(Boolean).join(' · ')}</small>}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function Checklist({ member, list, onTick, onOpenKid }: { member: FamilyMember; list: WallChecklist; onTick: KioskHomeProps['onTick']; onOpenKid: KioskHomeProps['onOpenKid'] }) {
  return (
    <div className="kc-checklist">
      <button type="button" className="kc-person-link" onClick={() => onOpenKid(member)}>{member.name} · {list.title}<ArrowRight aria-hidden="true" /></button>
      <div className="kc-chips">
        {list.rows.slice(0, 5).map((r) => (
          <button key={`${r.entityType}:${r.id}`} type="button" aria-pressed={r.done} className={`kc-chip-tick ${r.done ? 'is-done' : ''}`} onClick={() => onTick(member, r)}>
            {r.done && <Check aria-hidden="true" />}{r.title}
          </button>
        ))}
      </div>
    </div>
  )
}

function People({ members, onOpenKid }: { members: FamilyMember[]; onOpenKid: (m: FamilyMember) => void }) {
  return (
    <nav className="kc-people" aria-label="Family">
      {members.map((m, i) => (
        <button key={m.id} type="button" className="kc-person-btn" onClick={() => onOpenKid(m)} aria-label={`Open ${m.name}’s day`}>
          <span className={`kc-avatar tone-${i % 4}`} aria-hidden="true">{(m.initials || m.name).slice(0, 1)}</span>{m.name}
        </button>
      ))}
    </nav>
  )
}

function DinnerHero({ d, onOpenDinner, onStartCooking }: { d: KioskDinner; onOpenDinner: () => void; onStartCooking: () => void }) {
  return (
    <section className="kc-card kc-hero kc-dinner-card" aria-label="Dinner">
      <button type="button" className="kc-hero-photo" onClick={onOpenDinner} aria-label={`${d.title}: open dinner`}>
        {d.imageUrl ? <img src={d.imageUrl} alt="" /> : <span className="kc-photo-empty"><ChefHat aria-hidden="true" /></span>}
      </button>
      <div className="kc-kicker">{d.timeLabel ?? 'Dinner tonight'}{d.minutes ? ` · ${d.minutes} min` : ''}</div>
      <h2 className="kc-title">{d.title}</h2>
      {d.cue && <p className="kc-muted">{d.cue}</p>}
      <div className="kc-actions">
        <button type="button" className="kc-btn is-primary" onClick={onOpenDinner}>Servings & ingredients</button>
        {d.source && <button type="button" className="kc-btn" onClick={onStartCooking}>Start cooking</button>}
      </div>
    </section>
  )
}

function BedtimeCard({ grid, hero, onStart }: { grid: BedtimeGrid; hero?: boolean; onStart: () => void }) {
  return (
    <section className={`kc-card ${hero ? 'kc-hero' : ''}`} aria-label="Bedtime">
      <div className="kc-card-head"><h3><Moon aria-hidden="true" />{grid.title}</h3>{grid.total > 0 && <span className="kc-muted">{grid.done} of {grid.total}</span>}</div>
      {grid.people.length === 0
        ? <p className="kc-muted">No bedtime routine tonight.</p>
        : <ul className="kc-bed-summary">{grid.people.map((p) => {
            const mine = grid.steps.map((s) => s.cells.find((c) => c.memberId === p.id)?.row).filter((r): r is KidRow => !!r)
            const done = mine.filter((r) => r.done).length
            return <li key={p.id}><strong>{p.name}</strong><span className="kc-meter" style={{ ['--kc-progress' as string]: `${mine.length ? (done / mine.length) * 100 : 0}%` }} /><small>{done}/{mine.length}</small></li>
          })}</ul>}
      {grid.people.length > 0 && <button type="button" className="kc-btn is-accent" onClick={onStart}>{grid.done > 0 ? 'Carry on with bedtime' : 'Start bedtime'}</button>}
    </section>
  )
}

function NextMeal({ meal }: { meal: NonNullable<KioskHomeProps['nextMeal']> }) {
  const body = (
    <>
      {meal.imageUrl ? <img src={meal.imageUrl} alt="" /> : <span className="kc-photo-empty" aria-hidden="true"><ChefHat /></span>}
      <span><small className="kc-kicker">{meal.label}</small><strong>{meal.title}</strong></span>
    </>
  )
  if (!meal.onOpen) return <div className="kc-card kc-meal-line">{body}</div>
  return <button type="button" className="kc-card kc-meal-line" onClick={meal.onOpen}>{body}<ArrowRight aria-hidden="true" /></button>
}

export function KioskHome(p: KioskHomeProps) {
  const { comp, now, members } = p
  const kidsWithLists = p.checklists.filter((c) => c.list)
  const kids = p.checklists.map((c) => c.member)

  let body: ReactNode
  if (comp.hero === 'out-the-door') {
    const lines = (k: MomentKid) => [...(k.hint ? [k.hint] : []), ...k.needed.map((n) => `Bring: ${n}`), ...k.homeworkDue.map((h) => `Homework due: ${h}`)]
    body = (
      <div className="kc-compose kc-compose-morning">
        <section className="kc-card kc-hero" aria-label="Out the door">
          <div className="kc-card-head"><h2 className="kc-title"><Footprints aria-hidden="true" />Out the door</h2></div>
          <div className="kc-kid-cols">
            {p.kidsNow.map((k) => (
              <div key={k.member.id} className="kc-kid-col">
                <button type="button" className="kc-person-link" onClick={() => p.onOpenKid(k.member)}>{k.member.name}<ArrowRight aria-hidden="true" /></button>
                {lines(k).length ? <ul>{lines(k).map((l, i) => <li key={i}>{l}</li>)}</ul> : <p className="kc-muted">Nothing to remember.</p>}
              </div>
            ))}
          </div>
          <button type="button" className="kc-btn is-primary" onClick={p.onStartDeparture}>Get ready to leave</button>
        </section>
        <div className="kc-stack">
          <section className="kc-card" aria-label="Today">
            <h3>Today</h3>
            <Rows rows={upcomingRows(p.rows, 4)} members={members} onTapRow={p.onTapRow} empty="Nothing on the clock today." />
          </section>
          {kidsWithLists.length > 0 && (
            <section className="kc-card" aria-label="Morning routine">
              {kidsWithLists.map(({ member, list }) => <Checklist key={member.id} member={member} list={list!} onTick={p.onTick} onOpenKid={p.onOpenKid} />)}
            </section>
          )}
        </div>
      </div>
    )
  } else if (comp.hero === 'lanes') {
    const win = laneWindow(now)
    const lanes = buildPeopleLanes(p.rows, members, now, win)
    const working = p.kidsNow.filter((k) => k.afterSchool.length > 0)
    const nowLeft = ((now.getTime() - win.start.getTime()) / (win.end.getTime() - win.start.getTime())) * 100
    body = (
      <div className="kc-compose kc-compose-afternoon">
        <section className="kc-card kc-lanes-card" aria-label="Who’s where">
          <div className="kc-card-head"><h2 className="kc-title"><Users aria-hidden="true" />Who’s where</h2></div>
          {lanes.length === 0 ? <p className="kc-muted kc-quiet-line">Everyone’s home for the rest of the day.</p> : (
            <div className="kc-lanes">
              <div className="kc-lane-axis" aria-hidden="true">{win.ticks.map((t) => <span key={t.label} style={{ left: `${t.left}%` }}>{t.label}</span>)}</div>
              {lanes.map((l) => {
                // Only kids' pages open from the wall, as before: an adult's
                // page is theirs.
                const member = l.memberId ? kids.find((m) => m.id === l.memberId) : null
                return (
                  <div key={l.memberId ?? 'household'} className="kc-lane">
                    {member
                      ? <button type="button" className="kc-lane-name" onClick={() => p.onOpenKid(member)}>{l.name}</button>
                      : <span className="kc-lane-name">{l.name}</span>}
                    <div className="kc-lane-track">
                      <span className="kc-lane-now" style={{ left: `${nowLeft}%` }} aria-hidden="true" />
                      {l.blocks.map((b) => (
                        <button key={b.id} type="button" className={`kc-block ${b.now ? 'is-now' : ''}`} style={{ left: `${b.left}%`, width: `${b.width}%` }} onClick={() => p.onTapRow(b.id)} title={`${b.time} ${b.title}`}>
                          <strong>{b.time} {b.title}</strong>{b.sub && <small>{b.sub}</small>}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
        <div className="kc-two">
          <section className="kc-card" aria-label="After school">
            <h3>After school</h3>
            {p.handoffs.map((h) => (
              <div key={h.key} className="kc-handoff">
                <span><strong>{h.time}</strong> {h.prompt}<small>Nobody has this yet</small></span>
                <button type="button" className="kc-btn is-primary" onClick={p.onClaim}>Who’s got it?</button>
              </div>
            ))}
            {working.map((k) => (
              <Checklist key={k.member.id} member={k.member} list={{ title: 'After school', rows: k.afterSchool }} onTick={p.onTick} onOpenKid={p.onOpenKid} />
            ))}
            {working.length === 0 && p.handoffs.length === 0 && <p className="kc-muted">No homework or practice today.</p>}
          </section>
          <section className="kc-card" aria-label="Before dinner">
            <h3>Before dinner</h3>
            {p.nextMeal ? <NextMeal meal={p.nextMeal} /> : <p className="kc-muted">No dinner planned yet.</p>}
          </section>
        </div>
      </div>
    )
  } else if (comp.hero === 'dinner' || comp.hero === 'bedtime') {
    const tonight = tonightRows(p.rows, now)
    const dinnerHero = comp.hero === 'dinner' && p.dinner
    body = (
      <div className="kc-compose kc-compose-evening">
        {dinnerHero
          ? <DinnerHero d={p.dinner!} onOpenDinner={p.onOpenDinner} onStartCooking={p.onStartCooking} />
          : <BedtimeCard grid={p.bedtime} hero onStart={p.onStartBedtime} />}
        <div className="kc-stack">
          <section className="kc-card" aria-label="Tonight">
            <h3>Tonight</h3>
            <Rows rows={tonight} members={members} onTapRow={p.onTapRow} empty="Nothing else on tonight." />
          </section>
          {dinnerHero ? <BedtimeCard grid={p.bedtime} onStart={p.onStartBedtime} /> : (
            <section className="kc-card" aria-label="Tomorrow">
              <h3>Tomorrow</h3>
              {p.kidsNow.map((k) => {
                const lines = [...(k.special ? [`${k.special} tomorrow`] : []), ...k.needed.map((n) => `Bring: ${n}`), ...k.homeworkDue.map((h) => `Homework: ${h}`)]
                return lines.length ? <p key={k.member.id}><strong>{k.member.name}</strong> · {lines.join(' · ')}</p> : null
              })}
              {p.focusRows.length > 0 && <Rows rows={p.focusRows} members={members} onTapRow={p.onTapRow} empty="" />}
              {p.nextMeal && <NextMeal meal={p.nextMeal} />}
            </section>
          )}
        </div>
      </div>
    )
  } else {
    body = (
      <div className="kc-compose kc-compose-quiet">
        <div className="kc-quiet-cards">
          {p.nextMeal && <NextMeal meal={p.nextMeal} />}
          <section className="kc-card kc-small-card" aria-label="Coming up">
            <h3>Coming up</h3>
            {p.comingUp.length === 0 ? <p className="kc-muted">A quiet week ahead.</p> : p.comingUp.slice(0, 2).map((c) => <p key={c.dateKey}><strong>{c.dayLabel}</strong> {c.summary}</p>)}
          </section>
          {p.question
            ? <button type="button" className="kc-card kc-small-card kc-question" onClick={p.onTapQuestion}><MessageCircle aria-hidden="true" /><span><small className="kc-kicker">{p.question.isHandoff ? 'Who’s on?' : 'Question of the day'}</small>{p.question.text}</span></button>
            : <button type="button" className="kc-card kc-small-card kc-question" onClick={() => p.scratchpad.onOpen(null)}><MessageCircle aria-hidden="true" /><span><small className="kc-kicker">Notes</small>{p.scratchpad.rows[0]?.text ?? 'Jot a note for the family'}</span></button>}
        </div>
      </div>
    )
  }

  return (
    <div className={`kc-home is-${comp.part}`}>
      <div className="kc-home-bar">
        <People members={kids} onOpenKid={p.onOpenKid} />
        <div className="kc-tools">{p.tools}</div>
      </div>
      {body}
    </div>
  )
}
