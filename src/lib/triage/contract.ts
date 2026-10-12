// src/lib/triage/contract.ts
//
// THE triage contract (Scott, 2026-10-12: "we need uniform and comprehensive
// triaging options across the app … a skip option, a tomorrow option, and next
// week/weekend/month/someday"). One answer, per kind of thing, to "what can I
// do with this, in what order, and in which words":
//
//   When    Today · Tonight · Tomorrow · This week · Next week · This weekend ·
//           Next weekend · This month · Next month · This season · Someday ·
//           Pick date & time…
//   Skip    scoped: "Skip this time" (one routine occurrence) or "Skip this
//           day" (a dated task's day — the task, its week and its goal stay)
//   More    Complete/Reopen · Open details · People… · Life area… ·
//           Move under… · Delete
//
// Every surface that triages a thing draws its actions from here (Week canvas,
// Today, Inbox, details, Week planning rows) through the one renderer path —
// RescheduleGrid for When, TaskFateMenu for the whole menu — so labels, order
// and grouping cannot drift between pages.
//
// Uniform is not misleading. A kind that cannot honour a When says so (a
// routine occurrence has no Someday); goals keep goal verbs and get no days.

/** The temporal vocabulary. */
export type TriageWhen =
  | 'today' | 'tonight' | 'tomorrow'
  | 'this-week' | 'next-week' | 'this-weekend' | 'next-weekend'
  | 'this-month' | 'next-month' | 'this-season'
  | 'someday'

/** Every When, in the one order every surface shows them. */
export const WHEN_ORDER: readonly TriageWhen[] = [
  'today', 'tonight', 'tomorrow',
  'this-week', 'next-week', 'this-weekend', 'next-weekend',
  'this-month', 'next-month', 'this-season',
  'someday',
]

export const WHEN_LABEL: Record<TriageWhen, string> = {
  today: 'Today',
  tonight: 'Tonight',
  tomorrow: 'Tomorrow',
  'this-week': 'This week',
  'next-week': 'Next week',
  'this-weekend': 'This weekend',
  'next-weekend': 'Next weekend',
  'this-month': 'This month',
  'next-month': 'Next month',
  'this-season': 'This season',
  someday: 'Someday',
}

/** The custom date (and optional time) entry, last in the When group. */
export const PICK_DATE_LABEL = 'Pick date & time…'

/**
 * What kind of thing is being triaged.
 *  - task         an ordinary task with no day (a week/month pool, Someday)
 *  - dated-task   a task with a day (it can skip that day)
 *  - capture      an Inbox capture (a task not yet processed)
 *  - occurrence   one occurrence of a routine
 *  - period-goal  a Season or Month goal (a task row at bucket quarter/month)
 *  - year-goal    a Year goal (the goals table)
 *  - event        a calendar-provider event — never task triage
 */
export type TriageEntity = 'task' | 'dated-task' | 'capture' | 'occurrence' | 'period-goal' | 'year-goal' | 'event'

/**
 * How a When applies to a kind:
 *  - direct       one tap writes it
 *  - pick-day     the reader chooses an actual day inside that period first
 *                 (an occurrence has to be on a day — never silently Saturday)
 *  - unavailable  the model cannot honour it; the UI explains and offers the
 *                 scoped alternative instead of hiding it or doing nothing
 */
export type WhenAvailability = 'direct' | 'pick-day' | 'unavailable'

export type SkipId = 'skip-day' | 'skip-occurrence'
export const SKIP_LABEL: Record<SkipId, string> = {
  'skip-day': 'Skip this day',
  'skip-occurrence': 'Skip this time',
}
/** The one line under Skip that says exactly what it touches. */
export const SKIP_NOTE: Record<SkipId, string> = {
  'skip-day': 'Takes the day off it. The task, its week and its goal stay.',
  'skip-occurrence': 'Only this time. The routine keeps its schedule.',
}

export type MoreId = 'complete' | 'open' | 'people' | 'area' | 'move-under' | 'delete'

/** The secondary group, in its one order. */
export const MORE_ORDER: readonly MoreId[] = ['complete', 'open', 'people', 'area', 'move-under', 'delete']

export interface MoreLabelOpts {
  completed?: boolean
  entity?: TriageEntity
}

export function moreLabel(id: MoreId, opts: MoreLabelOpts = {}): string {
  switch (id) {
    case 'complete': return opts.completed ? 'Reopen' : 'Complete'
    // An occurrence's details are its routine's: say so, so a change there
    // is not mistaken for a change to this one time.
    case 'open': return opts.entity === 'occurrence' ? 'Open routine' : 'Open details'
    case 'people': return 'People…'
    case 'area': return 'Life area…'
    case 'move-under': return 'Move under…'
    case 'delete': return 'Delete'
  }
}

/**
 * The When group for a kind. Goals and events get none: a goal is planned in
 * periods, not days (its verbs are periodMoves below), and an event is moved
 * as an event.
 */
export function whenAvailability(entity: TriageEntity): Partial<Record<TriageWhen, WhenAvailability>> {
  if (entity === 'period-goal' || entity === 'year-goal' || entity === 'event') return {}
  if (entity === 'occurrence') {
    return {
      today: 'direct', tonight: 'direct', tomorrow: 'direct',
      'this-week': 'pick-day', 'next-week': 'pick-day',
      'this-weekend': 'pick-day', 'next-weekend': 'pick-day',
      'this-month': 'pick-day', 'next-month': 'pick-day',
      // A routine occurrence is always on a day: there is no undated
      // occurrence for the model to hold (a genuine limitation, explained).
      'this-season': 'unavailable', someday: 'unavailable',
    }
  }
  return Object.fromEntries(WHEN_ORDER.map((w) => [w, 'direct'])) as Record<TriageWhen, WhenAvailability>
}

/** The explanation shown for a When an occurrence cannot take. */
export function unavailableNote(when: TriageWhen): string {
  return when === 'someday'
    ? 'Someday isn’t available for one time of a routine. Skip this time, or change the routine itself.'
    : `${WHEN_LABEL[when]} isn’t available for one time of a routine — it needs a day. Pick a date, skip this time, or change the routine itself.`
}

/** Whether a kind can take a custom date (and time). */
export function takesPickDate(entity: TriageEntity): boolean {
  return entity === 'task' || entity === 'dated-task' || entity === 'capture' || entity === 'occurrence'
}

/** The scoped Skip for a kind, if it has one. */
export function skipFor(entity: TriageEntity): SkipId | null {
  if (entity === 'occurrence') return 'skip-occurrence'
  if (entity === 'dated-task') return 'skip-day'
  return null
}

/** The secondary verbs a kind can have (a surface offers those it can honour). */
export function moreFor(entity: TriageEntity): readonly MoreId[] {
  switch (entity) {
    case 'task':
    case 'dated-task':
    case 'capture':
      return MORE_ORDER
    // People and Life area belong to the routine, not this one time: changing
    // them from an occurrence would silently edit every other occurrence.
    case 'occurrence': return ['complete', 'open']
    case 'event': return ['open']
    case 'period-goal': return ['complete', 'open', 'move-under', 'delete']
    case 'year-goal': return ['complete', 'open']
  }
}

/** A goal's period word. */
export type GoalPeriod = 'season' | 'month' | 'year'

/**
 * A goal's period verbs, in order. A goal is moved between periods, carried
 * (the old period's record says "carried"), or taken off this period — never
 * given a day or a time, which would quietly turn it into a day task.
 */
export function periodMoves(period: GoalPeriod, nextName?: string): { id: 'carry' | 'remove-period' | 'archive'; label: string }[] {
  if (period === 'year') return [{ id: 'archive', label: 'Archive goal' }]
  return [
    { id: 'carry', label: `Carry to next ${period}${nextName ? ` · ${nextName}` : ''}` },
    { id: 'remove-period', label: `Remove from this ${period}` },
  ]
}

export interface ContractAction {
  group: 'when' | 'skip' | 'more'
  id: TriageWhen | 'pick-date' | SkipId | MoreId
  label: string
  availability?: WhenAvailability
}

/**
 * The whole ordered action list for a kind — what parity tests compare, and
 * what renderers walk. `completed` flips Complete to Reopen and drops When
 * and Skip (a finished thing is reopened before it is rescheduled).
 */
export function triageContract(entity: TriageEntity, opts: { completed?: boolean } = {}): ContractAction[] {
  const out: ContractAction[] = []
  if (!opts.completed) {
    const avail = whenAvailability(entity)
    for (const w of WHEN_ORDER) {
      const a = avail[w]
      if (a) out.push({ group: 'when', id: w, label: WHEN_LABEL[w], availability: a })
    }
    if (takesPickDate(entity)) out.push({ group: 'when', id: 'pick-date', label: PICK_DATE_LABEL, availability: 'direct' })
    const skip = skipFor(entity)
    if (skip) out.push({ group: 'skip', id: skip, label: SKIP_LABEL[skip] })
  }
  for (const m of moreFor(entity)) out.push({ group: 'more', id: m, label: moreLabel(m, { completed: opts.completed, entity }) })
  return out
}
