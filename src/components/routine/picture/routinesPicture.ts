// src/components/routine/picture/routinesPicture.ts
//
// The Routines page as a picture of the household's week (spec
// 2026-10-14-routines-talk-first, frame "After 1"): routines that happen every
// day written once on one line; a grid of the week's days by Morning,
// Afternoon, Evening and Any time; then the routines that are not weekly
// (Each month), the weekly ones with no day yet, and the ones not showing
// (resting or off). Pure: the page hands in what useWeekInstances and
// buildWeekRoutineItems (the same builder Week uses) already produced.

import type { ActionableInstance, RecurrencePattern, Routine } from '@/types/actionable'
import type { TimelineItem } from '@/types/timeline'
import { localYmd } from '@/lib/cadence/config'
import { routineOwners, routineSwitches } from '@/lib/routineUtils'
import { routineDayIndex, routineIdOf } from '@/lib/planning/weekDensity'

export type Band = 'morning' | 'afternoon' | 'evening' | 'anytime'
export const BANDS: { id: Band; label: string }[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
  { id: 'anytime', label: 'Any time' },
]

/** Morning before noon, afternoon until 5, evening after; no time is Any time. */
export function bandOf(time: Date | null | undefined): Band {
  if (!time) return 'anytime'
  const h = time.getHours()
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export const dayKeyOf = (d: Date) => DAY_KEYS[d.getDay()]

/** Which line or grid a routine's pattern puts it in. */
export type Cadence = 'every-day' | 'weekly' | 'less-often' | 'no-day'

export function cadenceOf(p: RecurrencePattern): Cadence {
  switch (p.type) {
    case 'daily': return (p.interval ?? 1) > 1 ? 'weekly' : 'every-day'
    case 'weekly': {
      const days = new Set((p.days ?? []).map((d) => d.slice(0, 3).toLowerCase()))
      if (days.size === 0) return 'no-day'
      return days.size === 7 && (p.interval ?? 1) <= 1 ? 'every-day' : 'weekly'
    }
    case 'weekend': return 'weekly'
    default: return 'less-often'
  }
}

/** A short word for a routine that is not weekly ("quarterly", "every 6 weeks"). */
export function cadenceHint(p: RecurrencePattern): string | undefined {
  switch (p.type) {
    case 'monthly': return (p.interval ?? 1) > 1 ? `every ${p.interval} months` : undefined
    case 'quarterly': return 'quarterly'
    case 'yearly': return 'yearly'
    case 'specific_days': return 'on set dates'
    case 'since_last': return p.interval ? `every ${p.interval} ${p.unit ?? 'days'}` : undefined
    default: return undefined
  }
}

/** A this-week change already saved on one day's occurrence. */
export interface Exception {
  kinds: ('skipped' | 'moved' | 'retimed' | 'who')[]
  /** "skipped", "from Thu", "Iris", "at 8:00" — joined for the mark. */
  label: string
  /** The day's own person, when the occurrence has one. */
  who?: string
}

/** One routine on one day of the picture. */
export interface Occurrence {
  key: string
  routineId: string
  dayKey: string
  title: string
  time: Date | null
  people: string[]
  steps: number
  /** The routine happens every day (written once, on the Every day line). */
  everyDay: boolean
  exception?: Exception
  /** A pending change card: 'proposed' dashed teal, 'leaving' dashed grey. */
  preview?: 'proposed' | 'leaving'
  /** A proposed skip: struck through. */
  struck?: boolean
  /** The preview's one-line reason ("Skipped · this week"). */
  previewNote?: string
}

/** A routine written once, on a line (Every day, Each month, No day yet, Not showing). */
export interface Chip {
  key: string
  routineId: string
  title: string
  time: Date | null
  people: string[]
  steps: number
  hint?: string
  preview?: 'proposed' | 'leaving'
}

export interface PictureDay {
  key: string
  date: Date
  bands: Record<Band, Occurrence[]>
}

export interface Picture {
  everyDay: Chip[]
  days: PictureDay[]
  lessOften: Chip[]
  noDay: Chip[]
  notShowing: Chip[]
}

export const clock = (t: Date) => `${t.getHours() % 12 === 0 ? 12 : t.getHours() % 12}:${String(t.getMinutes()).padStart(2, '0')}`
const shortWeekday = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' })
const parseYmd = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d) }

/** The routine's rule time on a given day, or null. */
export function ruleTime(routine: Pick<Routine, 'time_of_day'>, day: Date): Date | null {
  if (!routine.time_of_day) return null
  const [h, m] = routine.time_of_day.split(':').map(Number)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m || 0)
}

export interface OccurrenceArgs {
  /** buildWeekRoutineItems' output for these days. */
  items: TimelineItem[]
  /** The picture's days, in the household's week order. */
  days: Date[]
  instances: ActionableInstance[]
  /** Collection id → its number of steps. */
  stepCounts: ReadonlyMap<string, number>
  /** A household member's first name, for "Iris" marks. */
  nameOf?: (memberId: string) => string | undefined
}

/** Every routine occurrence of the week, with this week's saved changes said. */
export function buildOccurrences({ items, days, instances, stepCounts, nameOf }: OccurrenceArgs): Occurrence[] {
  const keys = days.map(localYmd)
  const routineRows = instances.filter((i) => i.entity_type === 'routine')
  const out: Occurrence[] = []
  for (const it of items) {
    const routine = it.originalRoutine
    const idx = routineDayIndex(it.id)
    if (!routine || idx < 0 || idx >= days.length) continue
    const routineId = routineIdOf(it.id)
    const dayKey = keys[idx]
    const day = days[idx]
    const own = routineRows.filter((i) => i.entity_id === routineId)
    const here = own.find((i) => i.date === dayKey)
    const landed = own.find((i) => i.date !== dayKey && i.status !== 'skipped' && !!i.deferred_to && localYmd(new Date(i.deferred_to)) === dayKey)
    const kinds: Exception['kinds'] = []
    const labels: string[] = []
    if (it.skipped || here?.status === 'skipped') { kinds.push('skipped'); labels.push('skipped') }
    if (landed) { kinds.push('moved'); labels.push(`from ${shortWeekday(parseYmd(landed.date))}`) }
    const rule = ruleTime(routine, day)
    if (!landed && rule && it.startTime && it.startTime.getTime() !== rule.getTime()) { kinds.push('retimed'); labels.push(`at ${clock(it.startTime)}`) }
    const who = it.assigneeOverride ?? (landed ?? here)?.assigned_to_override ?? undefined
    if (who) { kinds.push('who'); labels.push(nameOf?.(who) ?? 'someone else') }
    out.push({
      key: `${routineId}:${dayKey}`,
      routineId, dayKey,
      title: it.title,
      time: it.startTime ?? null,
      people: who ? [who] : routineOwners(routine),
      steps: stepCounts.get(routineId) ?? 0,
      everyDay: cadenceOf(routine.recurrence_pattern) === 'every-day',
      ...(kinds.length ? { exception: { kinds, label: labels.join(', '), ...(who ? { who } : {}) } } : {}),
    })
  }
  return out
}

/** Whether a routine is running and on (not resting, not off). The label is
 *  the reason it is not showing. */
export function notShowingWhy(routine: Routine): string | null {
  const s = routineSwitches(routine)
  if (!s.active) {
    if (!routine.paused_until) return 'resting'
    const until = new Date(routine.paused_until)
    return `resting until ${until.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  }
  if (s.off) return 'off'
  return null
}

export function chipOf(routine: Routine, steps: number, hint?: string): Chip {
  return {
    key: routine.id, routineId: routine.id, title: routine.name,
    time: ruleTime(routine, new Date(2000, 0, 1)),
    people: routineOwners(routine), steps, ...(hint ? { hint } : {}),
  }
}

const byTime = (a: { time: Date | null; title: string }, b: { time: Date | null; title: string }) => {
  const m = (t: Date | null) => (t ? t.getHours() * 60 + t.getMinutes() : 24 * 60)
  return m(a.time) - m(b.time) || a.title.localeCompare(b.title)
}

/** Does this occurrence take a place in a day's cell? Every-day routines are
 *  written once above — unless this day's occurrence is different this week,
 *  or a pending card touches it. */
export const inCell = (o: Occurrence) => !o.everyDay || !!o.exception || !!o.preview

export interface LayoutArgs {
  /** Top-level routines in the areas being viewed (steps are left out here). */
  routines: Routine[]
  occurrences: Occurrence[]
  days: Date[]
  stepCounts: ReadonlyMap<string, number>
  /** A pending card's marks on the lines (see routinesPreview). */
  lineMarks?: ReadonlyMap<string, 'leaving'>
  newChips?: { line: 'everyDay' | 'lessOften' | 'noDay'; chip: Chip }[]
}

export function layoutPicture({ routines, occurrences, days, stepCounts, lineMarks, newChips = [] }: LayoutArgs): Picture {
  const everyDay: Chip[] = []
  const lessOften: Chip[] = []
  const noDay: Chip[] = []
  const notShowing: Chip[] = []
  for (const r of routines) {
    if (r.parent_routine_id) continue
    const steps = stepCounts.get(r.id) ?? 0
    const why = notShowingWhy(r)
    if (why) { notShowing.push(chipOf(r, steps, why)); continue }
    const mark = lineMarks?.get(r.id)
    const withMark = (c: Chip): Chip => (mark ? { ...c, preview: mark } : c)
    const cad = cadenceOf(r.recurrence_pattern)
    if (cad === 'every-day') everyDay.push(withMark(chipOf(r, steps)))
    else if (cad === 'less-often') lessOften.push(withMark(chipOf(r, steps, cadenceHint(r.recurrence_pattern))))
    else if (cad === 'no-day') noDay.push(withMark(chipOf(r, steps)))
  }
  for (const { line, chip } of newChips) ({ everyDay, lessOften, noDay })[line].push(chip)
  const pictureDays: PictureDay[] = days.map((date) => {
    const key = localYmd(date)
    const bands: Record<Band, Occurrence[]> = { morning: [], afternoon: [], evening: [], anytime: [] }
    for (const o of occurrences) if (o.dayKey === key && inCell(o)) bands[bandOf(o.time)].push(o)
    for (const b of BANDS) bands[b.id].sort(byTime)
    return { key, date, bands }
  })
  everyDay.sort(byTime)
  const byTitle = (a: Chip, b: Chip) => a.title.localeCompare(b.title)
  return { everyDay, days: pictureDays, lessOften: lessOften.sort(byTitle), noDay: noDay.sort(byTitle), notShowing: notShowing.sort(byTitle) }
}

/** One day's whole list, every-day routines included (the phone's day). */
export function dayList(occurrences: Occurrence[], dayKey: string): Occurrence[] {
  return occurrences.filter((o) => o.dayKey === dayKey).sort(byTime)
}
