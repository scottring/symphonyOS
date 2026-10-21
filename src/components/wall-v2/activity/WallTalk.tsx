// The conversation on the wall's canvas (Kitchen wall v2, stage 3; mockups
// Ask, Change, PlanWeek and KidAsks, approved 2026-10-14).
//
//   side column   the last few turns — the speaker as a neutral "You" mark
//                 (no voice ID yet), Symphony in Fraunces — and, when
//                 Symphony proposes changes, the wall-size change card:
//                 title, what changes, Approve (≥112px) and Not now
//   lead          what the talk is about: the days a card changes, with the
//                 proposals dashed and a dotted trace where a moved item was;
//                 the family's next seven days while planning the week; the
//                 days Symphony pointed at for a question
//
// On out-the-door and bedtime the exchange shows in the reply band above the
// dock instead (KioskDock), unless a card or the week takes the canvas.
// Presentation only: useWallTalk holds the conversation, the Shell the data.

import { AudioLines, Archive, ArrowRight, Check, Plus, Undo2, UserRound, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { WallTodayRow } from '@/lib/wall/wallMomentsModel'
import { localYmd, type WeekStart } from '@/lib/cadence/config'
import { plannedWeekStart } from '@/lib/canvas/applyChangeSet'
import { cardDays, cardLine, dayEntries, dayTitle, dayWord, fitEntries, type DayEntry, type TalkTaskInfo } from '@/lib/wall/wallTalk'
import type { WallTalk, TalkCard, TalkTurn } from './useWallTalk'

/** The family's next seven days as the wall holds them, and what it knows of
 *  a task a card names (family layer only). */
export interface WallTalkWeek {
  days: { date: Date; rows: WallTodayRow[] }[]
  task: (id: string) => TalkTaskInfo | null
}

const KIND_ICON: Record<string, LucideIcon> = { MOVE: ArrowRight, ADD: Plus, LATER: Archive, WHO: UserRound }

export function BackToToday({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="kw-btn is-quiet kw-back-today" onClick={onBack}>
      <Undo2 aria-hidden="true" />Back to today
    </button>
  )
}

function Turn({ turn, big }: { turn: TalkTurn; big?: boolean }) {
  if (turn.who === 'you') {
    return (
      <div className="kw-turn">
        <span className="kw-you" aria-hidden="true">You</span>
        <div><p className="kw-meta">You</p><p className="kw-words">{turn.text}</p></div>
      </div>
    )
  }
  const len = turn.text.length
  return (
    <div className="kw-turn is-sym">
      <span className="kw-symdot" aria-hidden="true"><AudioLines /></span>
      <div>
        <p className="kw-eyebrow is-sym">Symphony</p>
        <p className={`kw-words ${big ? '' : len > 220 ? 'is-long' : len > 110 ? 'is-mid' : ''}`}>{turn.text}</p>
      </div>
    </div>
  )
}

/** The wall-size change card (Change.dc.html). */
export function WallChangeCard({ card, info, today, weekStartsOn, onApprove, onDismiss }: {
  card: TalkCard; info: (id: string) => TalkTaskInfo | null; today: Date; weekStartsOn: WeekStart; onApprove: () => void; onDismiss: () => void
}) {
  // Where an add with no day lands (applyChangeSet does the same).
  const weekStart = plannedWeekStart(card.set, today, weekStartsOn)
  const n = card.set.ops.length
  const saving = card.state === 'saving'
  const MAX = 4
  const shown = card.set.ops.slice(0, MAX)
  const days = cardDays(card.set, info).filter((d) => d !== 'none')
  const where = days.length === 1 ? ` to ${dayWord(days[0], today)}` : ''
  return (
    <section className="kw-card" aria-label="Proposed changes">
      <p className="kw-eyebrow is-sym">Symphony · {n} {n === 1 ? 'change' : 'changes'}{where}</p>
      <h2 className="kw-card-title">{card.set.title}</h2>
      <ul className="kw-ops">
        {shown.map((op) => {
          const line = cardLine(op, op.taskId ? info(op.taskId) : null, today, weekStart)
          const Icon = KIND_ICON[line.kind] ?? ArrowRight
          return (
            <li key={op.key} className="kw-op">
              <Icon aria-hidden="true" />
              <span>{line.title}<span className="kw-op-d">{line.detail}</span></span>
            </li>
          )
        })}
        {n > MAX && <li className="kw-op is-more"><span /><span>and {n - MAX} more</span></li>}
      </ul>
      {card.state === 'failed' && card.message && <p className="kw-card-err" role="alert">{card.message}</p>}
      <div className="kw-card-acts">
        <button type="button" className="kw-btn is-primary kw-approve" onClick={onApprove} disabled={saving}>
          <Check aria-hidden="true" />{saving ? 'Saving…' : 'Approve'}
        </button>
        <button type="button" className="kw-btn is-quiet kw-notnow" onClick={onDismiss} disabled={saving}>Not now</button>
      </div>
    </section>
  )
}

/** The side column while talking. */
export function WallConversation({ talk, info, today, onApprove, onUndo, onBack }: {
  talk: WallTalk; info: (id: string) => TalkTaskInfo | null; today: Date
  onApprove: () => void; onUndo: () => void; onBack?: () => void
}) {
  const { card, saved, planning, review } = talk
  const showCard = card && (!planning || review)
  // With a full card up only the request it answers fits beside it.
  const turns = showCard
    ? (card.set.ops.length <= 2 ? talk.turns.filter((t) => t.who === 'you').slice(-1) : [])
    : talk.turns.slice(planning && card ? -2 : -3)
  const lastSym = [...talk.turns].reverse().find((t) => t.who === 'symphony')
  return (
    <section className="kw-convo" aria-label="Talking with Symphony">
      {onBack && <div className="kw-convo-head"><span className="kw-grow" /><BackToToday onBack={onBack} /></div>}
      <div className={`kw-turns ${showCard ? 'is-short' : ''}`}>
        {turns.map((t) => <Turn key={t.id} turn={t} big={t === lastSym && turns.length === 1} />)}
        {talk.asking && <p className="kw-meta kw-thinking" role="status">Symphony is thinking…</p>}
      </div>
      {showCard && (
        <>
          <WallChangeCard card={card} info={info} today={today} weekStartsOn={talk.weekStartsOn} onApprove={onApprove} onDismiss={talk.dismiss} />
          <p className="kw-meta kw-family-only">Only family plans can change from the wall.</p>
        </>
      )}
      {card && planning && !review && (
        <div className="kw-card is-mini">
          <div className="kw-grow">
            <b>{card.set.ops.length} {card.set.ops.length === 1 ? 'change' : 'changes'} so far</b>
            <p className="kw-meta">Nothing saved until you approve</p>
          </div>
          <button type="button" className="kw-btn is-quiet" onClick={() => talk.setReview(true)}>Review</button>
        </div>
      )}
      {saved && (
        <div className="kw-card is-mini is-saved" role="status">
          <Check aria-hidden="true" className="kw-saved-check" />
          <div className="kw-grow">
            <b>Saved · {saved.title}</b>
            <p className="kw-meta">Undo for 30 seconds</p>
          </div>
          <button type="button" className="kw-btn kw-undo" onClick={onUndo}><Undo2 aria-hidden="true" />Undo</button>
        </div>
      )}
    </section>
  )
}

function EntryRow({ e, size }: { e: DayEntry; size: 'lg' | 'sm' }) {
  return (
    <div className={`kw-de is-${e.kind} is-${size}`} data-kind={e.kind}>
      <span className="kw-de-t">{e.time ?? ''}</span>
      <span className="kw-de-w"><span>{e.title}</span>{e.by && <span className="kw-de-by">{e.by}</span>}</span>
    </div>
  )
}

function DayColumn({ day, label, num, entries, max, size, today, unknown }: { day: string; label: string; num?: string; entries: DayEntry[]; max: number; size: 'lg' | 'sm'; today?: boolean; unknown?: boolean }) {
  const { rows, hidden } = fitEntries(entries, max)
  return (
    <div className={`kw-day ${today ? 'is-today' : ''}`} role="group" aria-label={dayTitle(day)}>
      <span className="kw-day-h">{label}</span>
      {num && <span className="kw-day-n">{num}</span>}
      {rows.map((e) => <EntryRow key={e.key} e={e} size={size} />)}
      {rows.length === 0 && <span className="kw-de-none">{unknown ? 'Not on the wall yet' : 'Nothing on the clock'}</span>}
      {hidden > 0 && <span className="kw-de-more">+{hidden} more</span>}
    </div>
  )
}

/** The lead while talking: the card's days, the week being planned, or the
 *  days Symphony pointed at. Null when the talk is about none of them. */
export function WallTalkLead({ talk, week, today, onBack }: { talk: WallTalk; week: WallTalkWeek; today: Date; onBack: () => void }): ReactNode {
  const rowsFor = (day: string) => week.days.find((d) => localYmd(d.date) === day)?.rows ?? []
  const ops = talk.card?.set.ops ?? []
  const head = (eyebrow: string) => (
    <div className="kw-talk-head">
      <p className="kw-eyebrow is-sym kw-grow">{eyebrow}</p>
      <BackToToday onBack={onBack} />
    </div>
  )

  if (talk.plan) {
    // The week being planned — the rest of this one, or next week on its last
    // day — named by its dates, not the wall's rolling next seven days.
    const plan = talk.plan
    return (
      <>
        {head(`Family only · ${plan.label}`)}
        <div className="kw-week" aria-label="The family’s week">
          {plan.days.map((date) => {
            const day = localYmd(date)
            const known = week.days.find((d) => localYmd(d.date) === day)
            return (
              <DayColumn key={day} day={day} label={date.toLocaleDateString('en-US', { weekday: 'short' })} num={String(date.getDate())}
                entries={dayEntries(day, known?.rows ?? [], ops, week.task, today)} max={5} size="sm" today={day === localYmd(today)}
                unknown={!known} />
            )
          })}
        </div>
      </>
    )
  }

  const days = talk.card ? cardDays(talk.card.set, week.task) : talk.pointed.filter((d) => week.days.some((w) => localYmd(w.date) === d))
  if (!days.length) return null
  const eyebrow = `Showing · ${days.map((d) => dayWord(d, today)).join(' · ')}`
  if (days.length === 1) {
    const day = days[0]
    const { rows, hidden } = fitEntries(dayEntries(day, day === 'none' ? [] : rowsFor(day), ops, week.task, today), 5)
    return (
      <>
        {head(eyebrow)}
        <h2 className="kw-talk-title">{dayTitle(day)}</h2>
        <div className="kw-oneday" role="group" aria-label={dayTitle(day)}>
          {rows.map((e) => <EntryRow key={e.key} e={e} size="lg" />)}
          {rows.length === 0 && <p className="kw-quiet">Nothing on the clock.</p>}
          {hidden > 0 && <p className="kw-meta">+{hidden} more that day</p>}
        </div>
      </>
    )
  }
  const shown = days.slice(0, 4)
  return (
    <>
      {head(eyebrow)}
      <div className="kw-days" style={{ ['--cols' as string]: shown.length }}>
        {shown.map((day) => {
          const [y, m, d] = day === 'none' ? [0, 0, 0] : day.split('-').map(Number)
          const date = day === 'none' ? null : new Date(y, m - 1, d)
          return (
            <DayColumn key={day} day={day} label={date ? date.toLocaleDateString('en-US', { weekday: 'long' }) : 'No day yet'} num={date ? String(date.getDate()) : undefined}
              entries={dayEntries(day, day === 'none' ? [] : rowsFor(day), ops, week.task, today)} max={5} size="sm" />
          )
        })}
      </div>
    </>
  )
}

/** Lead · hairline · the conversation: the canvas while a card, the week or a
 *  pointed day is up. */
export function WallTalkStage({ lead, side, plan }: { lead: ReactNode; side: ReactNode; plan?: boolean }) {
  return (
    <div className={`kw-stage is-talk ${plan ? 'is-plan' : ''}`}>
      <section className="kw-col" aria-label="What we’re talking about">{lead}</section>
      <div className="kw-vr" aria-hidden="true" />
      <aside className="kw-col kw-side" aria-label="Symphony">{side}</aside>
    </div>
  )
}
