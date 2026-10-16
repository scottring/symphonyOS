// Talking to the kitchen wall (Kitchen wall v2, stage 3): the rules the
// conversation follows, kept apart from React so they can be tested. PURE.
//
// The wall keeps its instant local handling (timers, kiosk commands,
// groceries, notes and talk-abouts); everything else is a turn with the full
// Symphony agent in wall mode (askWallAgent). While a change card is up,
// "approve" approves it — only a tap or those words ever save a card.

import type { ChangeOp, ChangeSet } from '@/lib/canvas/changeCard'
import { opRow, opWhen } from '@/lib/canvas/changeCard'
import { localYmd, weekStartAnchor, type WeekStart } from '@/lib/cadence/config'
import type { WallTodayRow } from './wallMomentsModel'

/** A conversation ends after this long with nothing said. */
export const TALK_IDLE_MS = 2 * 60_000
/** Undo stays up this long after Approve. */
export const TALK_UNDO_MS = 30_000
/** Past this the agent counts as not answering; wall-ask answers instead. */
export const AGENT_TIMEOUT_MS = 20_000

/** Moments that keep the whole stage: the exchange shows in the reply band. */
export function talkUsesBand(screen: string): boolean {
  return screen === 'out-the-door' || screen === 'bedtime'
}

export type TalkIntent = 'approve' | 'dismiss' | 'plan-week'

const tidyWords = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/^\s*(?:(?:hey|ok|okay|hi)[\s,]+)?symphony\b[\s,.!:-]*/, '').replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim()

const APPROVE = /^(?:(?:ok(?:ay)?|yes|yeah|yep|great|good|perfect|sure|thanks)\s+)*(?:please\s+)?(?:approve(?:\s+(?:it|that|this|them|all|all of (?:it|them)|the changes|the card|everything))?|(?:yes\s+)?(?:please\s+)?do it|(?:yes\s+)?(?:please\s+)?save (?:it|that|them|the changes))(?:\s+please)?$/
const DISMISS = /^(?:not now|never ?mind|cancel(?: that| it| the changes)?|forget it|dismiss(?: it| that)?)$/
const PLAN_WEEK = /^(?:(?:can we|lets|let us|i want to|we should|help (?:us|me))\s+)?plan (?:the|our|this) (?:rest of (?:the|our|this) )?week(?: together)?(?: please)?$/

/** Words that act on the wall itself rather than go to Symphony. Approve and
 *  Not now only mean something while a card is up. */
export function talkIntent(text: string, cardUp: boolean): TalkIntent | null {
  const t = tidyWords(text)
  if (!t) return null
  if (PLAN_WEEK.test(t)) return 'plan-week'
  if (cardUp && APPROVE.test(t)) return 'approve'
  if (cardUp && DISMISS.test(t)) return 'dismiss'
  return null
}

/** What the wall says to start planning: the desktop Week page's own opening
 *  (weekWalk in src/components/home/week/WeekViewV2.tsx) for the week we are
 *  in — "Help me plan the week." on its first day, the next week by its start on its
 *  last day, "Help me plan the rest of my week." between. */
export function wallPlanOpening(now: Date, weekStartsOn: WeekStart): string {
  const anchor = weekStartAnchor(now, weekStartsOn)
  if (localYmd(now) === localYmd(anchor)) return 'Help me plan the week.'
  const lastDay = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 6)
  if (localYmd(now) === localYmd(lastDay)) {
    const next = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 7)
    return `Help me plan the week of ${next.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`
  }
  return 'Help me plan the rest of my week.'
}

/** Rejects with 'timeout' when the promise takes longer than `ms`; `onTimeout`
 *  lets the caller abort the work it stopped waiting for. */
export function withTimeout<T>(p: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => { onTimeout?.(); reject(new Error('timeout')) }, ms)
    p.then((v) => { clearTimeout(id); resolve(v) }, (e) => { clearTimeout(id); reject(e) })
  })
}

// ─── Drawing a change card on the wall ───────────────────────────────────

/** What the wall knows of a task an op names (the family layer only). */
export interface TalkTaskInfo {
  title: string
  /** Where it sits now: its time, or its day at midnight when all-day. */
  at: Date | null
  allDay: boolean
  who: string[]
}

export interface DayEntry {
  key: string
  /** plain: already on the day · prop: proposed (dashed) · trace: where a
   *  moved item was (dotted). */
  kind: 'plain' | 'prop' | 'trace'
  /** "4:00", or null for no time. */
  time: string | null
  title: string
  /** Who, or what changes ("Scott → Iris", "moving to Fri"). */
  by: string | null
  /** Minutes after midnight, for order; untimed sort last. */
  min: number
}

const clock = (d: Date) => `${d.getHours() % 12 === 0 ? 12 : d.getHours() % 12}:${String(d.getMinutes()).padStart(2, '0')}`
const hm = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m }
const shortDay = (d: Date, today: Date) => (localYmd(d) === localYmd(today) ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' }))

/** The days a card touches, in order: where things go and where moved things
 *  were. 'none' collects what lands on no day. */
export function cardDays(set: ChangeSet, info: (id: string) => TalkTaskInfo | null): string[] {
  const days = new Set<string>()
  for (const op of set.ops) {
    const t = op.taskId ? info(op.taskId) : null
    if (op.date && op.op !== 'assign') days.add(op.date)
    if (t?.at && op.op !== 'add') days.add(localYmd(t.at))
    if (!op.date && !(t?.at) && op.op !== 'assign') days.add('none')
  }
  return [...days].sort((a, b) => (a === 'none' ? 1 : b === 'none' ? -1 : a.localeCompare(b)))
}

/** The ops a task row on this day stands for, so the row is drawn once. */
const touched = (ops: readonly ChangeOp[]) => new Set(ops.filter((o) => o.taskId).map((o) => `task-${o.taskId}`))

/**
 * One day of the lead's picture: what is already there (plain), what Symphony
 * proposes (dashed) and where a moved item was (a dotted trace), in time order.
 */
export function dayEntries(day: string, rows: readonly WallTodayRow[], ops: readonly ChangeOp[], info: (id: string) => TalkTaskInfo | null, today: Date): DayEntry[] {
  const out: DayEntry[] = []
  const skip = touched(ops)
  for (const r of rows) {
    if (skip.has(r.id)) continue
    const at = r.startsAt ? new Date(r.startsAt) : null
    out.push({ key: r.id, kind: 'plain', time: at ? clock(at) : null, title: r.title, by: r.sub, min: at ? at.getHours() * 60 + at.getMinutes() : 24 * 60 })
  }
  for (const op of ops) {
    const t = op.taskId ? info(op.taskId) : null
    const who = op.assigneeName ?? (t?.who.length ? t.who.join(', ') : null)
    const was = t?.at && !t.allDay ? t.at : null
    const wasDay = t?.at ? localYmd(t.at) : null
    // Where it lands.
    if ((op.op === 'place' || op.op === 'add') && (op.date ?? 'none') === day) {
      out.push({ key: `p-${op.key}`, kind: 'prop', time: op.time ? clock(opWhen(op)!) : null, title: op.title, by: who, min: op.time ? hm(op.time) : 24 * 60 + 1 })
    }
    if (op.op === 'assign' && (wasDay ?? 'none') === day) {
      const before = t?.who.length ? `${t.who.join(', ')} → ` : ''
      out.push({ key: `p-${op.key}`, kind: 'prop', time: was ? clock(was) : null, title: op.title, by: `${before}${op.assigneeName ?? 'someone'}`, min: was ? was.getHours() * 60 + was.getMinutes() : 24 * 60 + 1 })
    }
    // Where it was.
    const wasTime = was ? `${String(was.getHours()).padStart(2, '0')}:${String(was.getMinutes()).padStart(2, '0')}` : null
    const stays = op.op === 'place' && op.date === wasDay && (op.time ?? null) === wasTime
    if ((op.op === 'place' || op.op === 'unplace' || op.op === 'someday') && wasDay === day && !stays) {
      const to = op.op === 'place' ? (op.date === day ? `moving to ${op.time ? clock(opWhen(op)!) : 'no time'}` : `moving to ${shortDay(opWhen(op)!, today)}`) : op.op === 'someday' ? 'moving to Someday' : 'moving to no day yet'
      out.push({ key: `t-${op.key}`, kind: 'trace', time: was ? clock(was) : null, title: op.title, by: to, min: was ? was.getHours() * 60 + was.getMinutes() : 24 * 60 })
    }
  }
  return out.sort((a, b) => a.min - b.min)
}

/** Fit a day's entries to `max` rows: every proposal and trace first, then
 *  the plain rows nearest them in time. Returns the rows kept, in order, and
 *  how many plain rows were left out. */
export function fitEntries(entries: readonly DayEntry[], max: number): { rows: DayEntry[]; hidden: number } {
  if (entries.length <= max) return { rows: [...entries], hidden: 0 }
  const marked = entries.filter((e) => e.kind !== 'plain')
  const room = Math.max(0, max - marked.length)
  const plain = entries.filter((e) => e.kind === 'plain')
  const near = (e: DayEntry) => Math.min(...(marked.length ? marked.map((m) => Math.abs(m.min - e.min)) : [e.min]))
  const keep = new Set([...plain].sort((a, b) => near(a) - near(b)).slice(0, room))
  const rows = entries.filter((e) => e.kind !== 'plain' || keep.has(e))
  return { rows: rows.slice(0, Math.max(max, marked.length)), hidden: plain.length - keep.size }
}

/** One line of the wall's change card: what changes, and the detail line
 *  ("Thu 5:30 → Fri 7:00 · Ella, Kaleb"). */
export function cardLine(op: ChangeOp, info: TalkTaskInfo | null, today: Date): { kind: ReturnType<typeof opRow>['kind']; title: string; detail: string } {
  const row = opRow(op, today)
  const was = info?.at ? `${shortDay(info.at, today)}${info.allDay ? '' : ` ${clock(info.at)}`}` : null
  const who = op.op === 'assign' ? null : op.assigneeName ?? (info?.who.length ? info.who.join(', ') : null)
  let where: string
  if (op.op === 'add') where = row.where
  else if (op.op === 'assign') where = `${info?.who.length ? `${info.who.join(', ')} ` : ''}${row.where}`
  else where = was ? `${was} ${row.where}` : row.where
  return { kind: row.kind, title: op.title, detail: [where, who].filter(Boolean).join(' · ') }
}

/** "Thursday, October 15" / "No day yet" for a day key. */
export function dayTitle(day: string): string {
  if (day === 'none') return 'No day yet'
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

/** "tomorrow afternoon"-style words are the agent's; the wall names days. */
export function dayWord(day: string, today: Date): string {
  if (day === 'none') return 'no day yet'
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = Math.round((date.getTime() - t.getTime()) / 86_400_000)
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  return date.toLocaleDateString('en-US', { weekday: 'long' })
}
