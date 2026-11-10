// The kitchen wall's board (Scott, 2026-11-10, from his list: "dinner
// tonight, 'waiting for' items (from and to), calendar appointments, school
// assignments and announcements"). The quiet daytime screen: dinner across
// the top, then Calendar · Waiting for · School.
//
// Pure: the waits from the app's own tasks (family only — the wall shows the
// Family layer), and the announcements from the newest kept school digest.
import type { Task } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { assigneesOf } from '@/lib/planning/v2/planV2'
import { dayLabel, type SchoolDigest } from '@/lib/schoolDigest/schoolDigests'
import { localYmd } from '@/lib/cadence/config'
import type { V1Kid } from '@/components/wall-v2/activity/KioskHomeV1'

export interface BoardPerson { name: string; member?: FamilyMember }
export interface BoardWait { id: string; title: string; from: BoardPerson; to: BoardPerson; when: string | null; late: boolean }

const DAY = 86_400_000
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const daysFrom = (a: Date, b: Date) => Math.round((midnight(b) - midnight(a)) / DAY)
const firstName = (m: FamilyMember) => m.name.split(' ')[0]

/** A household member by the name a wait was given ("Iris"), else just the name. */
function personNamed(name: string, members: readonly FamilyMember[]): BoardPerson {
  const n = name.trim().toLowerCase()
  const member = members.find((m) => firstName(m).toLowerCase() === n || m.name.toLowerCase() === n)
  return member ? { name: firstName(member), member } : { name: name.trim() }
}
/** Whoever carries the task; the household when no one does. */
function carrier(t: Task, members: readonly FamilyMember[]): BoardPerson {
  const member = assigneesOf(t).map((id) => members.find((m) => m.id === id)).find((m): m is FamilyMember => !!m)
  return member ? { name: firstName(member), member } : { name: 'Us' }
}

const dayWord = (d: Date, now: Date) => {
  const n = daysFrom(now, d)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (Math.abs(n) < 7) return WEEKDAY[d.getDay()]
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const isOpen = (t: Task) => t.context === 'family' && !t.completed && !t.dismissedAt

export function boardWaits(tasks: readonly Task[], members: readonly FamilyMember[], now: Date): { theirs: BoardWait[]; ours: BoardWait[] } {
  const theirs = tasks.filter((t) => isOpen(t) && t.isWaiting).map((t) => {
    const age = t.waitingSince ? daysFrom(t.waitingSince, now) : null
    return {
      id: t.id, title: t.title,
      from: personNamed(t.waitingFor || 'Someone', members), to: carrier(t, members),
      when: age == null ? null : age <= 0 ? 'Today' : age === 1 ? '1 day' : `${age} days`,
      late: false, since: t.waitingSince?.getTime() ?? Infinity,
    }
  }).sort((a, b) => a.since - b.since).map(({ since: _since, ...w }) => w)
  const ours = tasks.filter((t) => isOpen(t) && !!t.owedTo?.trim()).map((t) => {
    const due = t.scheduledFor ?? t.neededOn ?? null
    const late = !!due && daysFrom(now, due) < 0
    return {
      id: t.id, title: t.title, from: carrier(t, members), to: personNamed(t.owedTo!, members),
      when: due ? (late ? `Was due ${dayWord(due, now)}` : `Due ${dayWord(due, now)}`) : null,
      late, at: due?.getTime() ?? Infinity,
    }
  }).sort((a, b) => a.at - b.at).map(({ at: _at, ...w }) => w)
  return { theirs, ours }
}

export interface BoardNews { label: string; items: { title: string; sub: string | null }[] }

/** The newest digest's to-dos, then what to know. A week old is no longer news. */
export function boardNews(digests: readonly SchoolDigest[], now: Date): BoardNews | null {
  const d = digests[0]
  if (!d) return null
  const [y, m, day] = d.date.split('-').map(Number)
  if (daysFrom(new Date(y, m - 1, day), now) > 7) return null
  const items = [
    ...d.sections.flatMap((s) => s.toDo.map((i) => ({ title: i.title, sub: [i.when, i.details].filter(Boolean).join(' · ') || null }))),
    ...d.sections.flatMap((s) => s.goodToKnow.map((g) => ({ title: g, sub: null }))),
  ]
  return { label: dayLabel(d, localYmd(now)), items }
}

export interface Assignment { key: string; taskId: string | null; title: string; when: string | null; late: boolean; who: FamilyMember[] }

/** Each kid's school work today, then what's due later this week, one row per
 *  piece of work however many kids have it. Done work drops off. */
export function boardAssignments(kids: V1Kid[]): Assignment[] {
  const out: Assignment[] = []
  const add = (a: Omit<Assignment, 'who'>, kid: FamilyMember) => {
    const at = out.find((x) => x.title.toLowerCase() === a.title.toLowerCase() && x.when === a.when)
    if (at) { if (!at.who.some((m) => m.id === kid.id)) at.who.push(kid) } else out.push({ ...a, who: [kid] })
  }
  for (const k of kids) {
    for (const { row, note } of k.work?.today ?? []) {
      if (row.done) continue
      add({ key: `${row.entityType}-${row.id}`, taskId: row.entityType === 'task' ? row.id : null, title: row.title, when: note === 'late' ? 'Late' : note ? note[0].toUpperCase() + note.slice(1) : null, late: note === 'late' }, k.member)
    }
  }
  for (const k of kids) for (const w of k.work?.week ?? []) add({ key: w.id, taskId: w.id, title: w.title, when: `Due ${w.due}`, late: false }, k.member)
  return out
}
