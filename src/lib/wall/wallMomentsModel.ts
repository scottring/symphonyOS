// What the wall shows, by time of day (Scott, 2026-10-04; mockup "Wall, by
// time of day"). Pure projections over the data the wall already holds —
// useWallData's days and the kids' day models — so no new queries on a
// display that polls all day.
import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember } from '@/types/family'
import type { WallDayData } from '@/hooks/useWallData'
import { routineEarnsTheWall } from '@/lib/routineUtils'
import { boardOwnersOf } from '@/components/wall-v2/wallGantt'
import { titleForMember, HOUSEHOLD_ID } from '@/components/wall-v2/wallEventAttribution'
import { bandForTime, type MemberDayModel, type KidRow } from './kidDayModel'
import type { WallMoment } from './wallMoment'

/** "7:30a", "2:10p", "12p". */
export function wallClock(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'a' : 'p'}`
}

export interface WallTodayRow {
  id: string
  kind: TimelineItem['type']
  time: string
  end: string | null
  title: string
  sub: string | null
  /** Family member ids who carry it (never the household row). */
  owners: string[]
  past: boolean
  /** Starting within the next 45 minutes, or under way. */
  now: boolean
}

/**
 * Today's timed things in order. A routine that runs most days is the week's
 * shape, not news, and stays off (the board's rule, routineEarnsTheWall); a
 * collection step never stands alone, and neither does a task's step: it
 * folds into its task's row as "3 steps" (2026-10-07 — a task and its three
 * steps were four rows at 8:30).
 */
export function wallTodayRows(items: Record<string, TimelineItem[]>, members: FamilyMember[], now: Date): WallTodayRow[] {
  const all = Object.values(items).flat()
  const ids = new Set(all.map((it) => it.id))
  const steps = new Map<string, number>()
  for (const it of all) {
    if (it.isSubtask && it.parentTaskId && ids.has(`task-${it.parentTaskId}`) && !it.completed) {
      steps.set(`task-${it.parentTaskId}`, (steps.get(`task-${it.parentTaskId}`) ?? 0) + 1)
    }
  }
  const seen = new Set<string>()
  const rows: (WallTodayRow & { at: number })[] = []
  for (const it of all) {
    if (!it.startTime || it.allDay || seen.has(it.id)) continue
    if (it.isSubtask && it.parentTaskId && ids.has(`task-${it.parentTaskId}`)) continue
    if (it.type === 'routine' && (it.originalRoutine?.parent_routine_id != null || !routineEarnsTheWall(it.recurrencePattern))) continue
    if (it.completed && it.type !== 'event') continue
    seen.add(it.id)
    const stepCount = steps.get(it.id) ?? 0
    const start = new Date(it.startTime)
    const end = it.endTime ? new Date(it.endTime) : null
    const endsAt = (end ?? new Date(start.getTime() + 30 * 60_000)).getTime()
    rows.push({
      at: start.getTime(),
      id: it.id,
      kind: it.type,
      time: wallClock(start),
      end: end && end.getTime() - start.getTime() >= 45 * 60_000 ? wallClock(end) : null,
      title: it.title,
      sub: (it as TimelineItem & { location?: string | null }).location?.split(',')[0]
        ?? (stepCount ? `${stepCount} ${stepCount === 1 ? 'step' : 'steps'}` : null),
      owners: boardOwnersOf(it, members).filter((id) => id !== HOUSEHOLD_ID),
      past: endsAt <= now.getTime(),
      now: start.getTime() <= now.getTime() + 45 * 60_000 && endsAt > now.getTime(),
    })
  }
  return rows.sort((a, b) => a.at - b.at).map(({ at: _at, ...r }) => r)
}

export interface SpecialsDay {
  key: string
  day: string
  isToday: boolean
  isTomorrow: boolean
  cells: { memberId: string; text: string }[]
}

const SPECIALS = /^specials\b/i
const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

/** The week's school specials, one row per day that has them, each kid's half. */
export function specialsWeek(days: WallDayData[], kids: FamilyMember[], today: Date): SpecialsDay[] {
  const todayKey = ymd(today)
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const out: SpecialsDay[] = []
  for (const d of days) {
    const ev = Object.values(d.items).flat().find((i) => SPECIALS.test(i.title))
    if (!ev) continue
    out.push({
      key: ymd(d.date),
      day: d.date.toLocaleDateString('en-US', { weekday: 'short' }),
      isToday: ymd(d.date) === todayKey,
      isTomorrow: ymd(d.date) === ymd(tomorrow),
      cells: kids.map((k) => {
        const t = titleForMember(ev.title, k.name)
        return { memberId: k.id, text: t === ev.title ? '' : t }
      }),
    })
  }
  return out
}

export interface WallChecklist { title: string; rows: KidRow[] }

const BAND: Record<WallMoment, 'morning' | 'afternoon' | 'evening'> = {
  morning: 'morning', after: 'afternoon', dinner: 'evening', evening: 'evening',
}
const BAND_TITLE = { morning: 'This morning', afternoon: 'This afternoon', evening: 'Tonight' } as const

/** A kid's list for the part of the day: their routine for it (Out the door,
 *  Bedtime…), else that band's own rows. */
export function checklistFor(model: MemberDayModel, moment: WallMoment): WallChecklist | null {
  const band = BAND[moment]
  const collection = model.collections.find((c) => bandForTime(c.timeOfDay) === band && c.rows.length > 0)
  if (collection) return { title: collection.title, rows: collection.rows }
  const rows = model.bands[band] ?? []
  return rows.length ? { title: BAND_TITLE[band], rows } : null
}

/** Work a child does after school: practice and homework, by name. */
const PRACTICE = /\b(math|maths|reading|read|practice|homework|spelling|study|studying)\b/i

/**
 * A kid's after-school work, once each (Scott, 2026-10-07: "the day's
 * homework and math/reading practice … in the afternoon"): homework due by
 * the next school day (or late), then today's practice routines — the reading
 * target and any routine or collection step named for math, reading,
 * spelling or homework. Every row ticks off where it stands.
 */
export function afterSchoolRows(model: MemberDayModel): KidRow[] {
  const out: KidRow[] = []
  const seen = new Set<string>()
  const add = (r: KidRow) => {
    const key = `${r.entityType}:${r.id}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(r)
  }
  for (const h of model.homework) {
    if (!(h.late || h.due === null || h.due === 'Today' || h.due === 'Tomorrow')) continue
    const when = h.late ? 'late' : h.due === 'Tomorrow' ? 'due tomorrow' : null
    add({ entityType: 'task', id: h.id, title: when ? `${h.title} · ${when}` : h.title, done: false, timeOfDay: null, target: null })
  }
  if (model.reading) add(model.reading)
  const routineRows = [...Object.values(model.bands).flat(), ...model.collections.flatMap((c) => c.rows)]
  for (const r of routineRows) if (PRACTICE.test(r.title)) add(r)
  return out
}
