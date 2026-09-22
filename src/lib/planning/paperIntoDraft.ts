// src/lib/planning/paperIntoDraft.ts
//
// A photographed page can join the plan you are writing. The session draft is
// the list you are in the middle of making; a page snapped for the same
// period is the same thinking on paper, so its lines belong on that draft
// rather than in a second, parallel list.
//
// Nothing here writes. It decides, purely: which draft a page of this
// altitude would join (`draftTargetFor`), and what merging the page into that
// draft gives (`mergePaperIntoDraft`) — every line first matched, with the
// app's one matcher, against the draft itself, the level above, the previous
// period and the current list, so a page never creates a second copy of
// something already planned. Day-facts and recurring lines are not the
// draft's; they come back untouched for the normal commit path.

import type { PageAltitude, PageReviewPayload } from '@/lib/planParse'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import type { Layer } from '@/lib/domains'
import { goalAsRow, lookBackRows, yearLookBack, type NewItem, type SessionDraft, type SessionLevel } from './session'
import { filterTasksForLayers, matchesLayers } from '@/lib/today/domainFilter'
import { weekListTasks } from './weekList'
import { monthStartOf } from './periodPlacement'
import { readDraft } from './sessionDraft'
import { findLikelyDuplicate, type ExistingTask } from '@/lib/planDuplicates'
import { localYmd, parseLocalYmd, readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { seasonLabel, type Seasons } from '@/lib/cadence/seasons'
import { formatWeekRangeShort } from '@/lib/dateHelpers'
import { isCurrentPeriod, offerableFromAbove, periodBounds, planningPeriod, selectPeriodTasks } from './periodPage'

export interface DraftTarget {
  level: SessionLevel
  /** Local YYYY-MM-DD — the draft's key, as the session pages write it. */
  periodStart: string
  /** The period as that page names it: "this week", "October", "Fall 2026", "2027". */
  label: string
}

const DAY_MS = 86_400_000

interface Candidate { level: SessionLevel; start: Date; label: string }

function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long' })
}

/**
 * The periods a page of this altitude could be planning, best guess first.
 *
 * The calendar can only guess: a month page snapped on the 3rd is usually
 * this month, but the session in progress may be next month's. So the guess
 * is a LIST — the likely period, then its neighbour — and the draft in
 * storage decides which one the offer is for. A year page is always the
 * current year: the Nov 20 turn belongs to the nudge, not to the page.
 */
function candidates(altitude: PageAltitude, now: Date, seasons: Seasons, chosenStart?: Date | null): Candidate[] {
  if (altitude === 'week') {
    const { weekStartsOn } = readCadenceConfig()
    const thisWeek = weekStartAnchor(now, weekStartsOn)
    const nextWeek = weekStartAnchor(new Date(thisWeek.getTime() + 8 * DAY_MS), weekStartsOn)
    const day = now.getDay()
    // The weekend is when the week ahead gets planned; midweek it is this one.
    // Either way the other week is the fallback.
    const order = day === 6 || day === 0 ? [nextWeek, thisWeek] : [thisWeek, nextWeek]
    return order.map((start) => ({
      level: 'week' as const,
      start,
      label: start.getTime() === thisWeek.getTime() ? 'this week' : `the week of ${formatWeekRangeShort(start)}`,
    }))
  }
  if (altitude === 'year') {
    const year = now.getFullYear()
    return [{ level: 'year', start: new Date(year, 0, 1), label: `${year}` }]
  }
  const level = altitude === 'season' ? 'season' : 'month'
  const label = (start: Date) => (level === 'season' ? seasonLabel(start, seasons) : monthLabel(start))
  // The chip on the sheet is the user saying which period the page is for; it
  // beats the calendar, and it is then the ONLY candidate.
  if (chosenStart) {
    const start = periodBounds(level, chosenStart, seasons).start
    return [{ level, start, label: label(start) }]
  }
  const cur = periodBounds(level, now, seasons)
  // The period the page for this level opens on — the same question
  // PeriodPlanPage asks. No list to count from here: the calendar decides.
  const { start } = planningPeriod({ level, today: now, seasons, countFor: () => 0 })
  const other = start.getTime() === cur.start.getTime() ? cur.next : cur.start
  return [start, other].map((d) => ({ level, start: d, label: label(d) }))
}

/**
 * The draft a page of this altitude would join, or null when there is no
 * session in progress for any period it could be planning — the offer only
 * appears over a plan you are actually writing.
 */
export function draftTargetFor(
  altitude: PageAltitude,
  now: Date,
  seasons: Seasons,
  userId: string | null,
  /** The month/season the sheet's chip settled on, when it has moved. */
  chosenStart?: Date | null,
): DraftTarget | null {
  for (const c of candidates(altitude, now, seasons, chosenStart)) {
    const periodStart = localYmd(c.start)
    if (readDraft(userId, c.level, periodStart)) return { level: c.level, periodStart, label: c.label }
  }
  return null
}

export type MatchSource = 'draft' | 'above' | 'previous' | 'current'

export interface PaperMatch {
  /** The page line. */
  title: string
  /** What it was taken to already be. */
  matchedTo: string
  where: MatchSource
}

export interface MergeResult {
  draft: SessionDraft
  /** Titles actually added to the draft. */
  added: string[]
  matched: PaperMatch[]
  /** The page minus the lines the draft took: day-facts, recurring lines and
   *  notes still go through the ordinary commit. */
  rest: PageReviewPayload
}

export interface MergeContext {
  /** The previous period's open rows — the session's look-back. */
  open: readonly ExistingTask[]
  /** The level above (the rail). */
  above: readonly ExistingTask[]
  /** This period's list as it already stands. */
  current: readonly ExistingTask[]
}

const asExisting = (n: NewItem): ExistingTask => ({ id: n.id, title: n.title })

/**
 * Merge a reviewed page into a session draft. Goal lines land on `newGoals`,
 * task lines on `newTasks` (with the line's day when the draft is a week's).
 * Every line is matched first — against the draft's own items (including the
 * ones this very merge just added, so a page listing a thing twice adds it
 * once, and re-importing the same page adds nothing), then the level above,
 * the previous period, and the current list. A match is reported, not added.
 */
export function mergePaperIntoDraft(draft: SessionDraft, payload: PageReviewPayload, ctx: MergeContext): MergeResult {
  const newGoals = [...draft.newGoals]
  const newTasks = [...draft.newTasks]
  const added: string[] = []
  const matched: PaperMatch[] = []
  const restItems: PageReviewPayload['items'] = []

  for (const item of payload.items) {
    const title = item.title.trim()
    // A day-fact is not a to-do and a recurring line is a routine: neither is
    // a thing the plan lists. They stay on the direct-commit path.
    if (item.kind !== 'task' || !title) {
      restItems.push(item)
      continue
    }
    const sources: Array<[MatchSource, readonly ExistingTask[]]> = [
      ['draft', [...newGoals, ...newTasks].map(asExisting)],
      ['above', ctx.above],
      ['previous', ctx.open],
      ['current', ctx.current],
    ]
    let hit: PaperMatch | null = null
    for (const [where, existing] of sources) {
      const dup = findLikelyDuplicate(title, [...existing])
      if (dup) { hit = { title, matchedTo: dup.title, where }; break }
    }
    if (hit) { matched.push(hit); continue }

    const isGoal = item.placement.kind === 'goal' || item.goal === true
    const entry: NewItem = { id: crypto.randomUUID(), title, context: null }
    if (!isGoal && draft.level === 'week' && item.placement.kind === 'date') entry.day = item.placement.date
    if (isGoal) newGoals.push(entry)
    else newTasks.push(entry)
    added.push(title)
  }

  return {
    draft: { ...draft, newGoals, newTasks },
    added,
    matched,
    rest: { ...payload, items: restItems },
  }
}

export interface MatchSourceInput {
  tasks: Task[]
  goals: readonly Goal[]
  layers: ReadonlySet<Layer>
  meId: string | null
  seasons: Seasons
}

/**
 * The three lists a page's lines are matched against, built the way the
 * session pages themselves build them — the period's own list, the rung
 * above, and what the previous period left open. Without these the import
 * would only know the draft, and would happily add a second copy of
 * something the plan already holds.
 */
export function matchSourcesFor(target: DraftTarget, { tasks, goals, layers, meId, seasons }: MatchSourceInput): MergeContext {
  const layered = filterTasksForLayers(tasks, layers)
  const start = parseLocalYmd(target.periodStart)
  const today = new Date()
  const activeGoalsOf = (year: number) => goals
    .filter((g) => g.year === year && g.status === 'active' && matchesLayers(g.context, layers))
    .map(goalAsRow)

  if (target.level === 'week') {
    const isCurrent = start <= today && today.getTime() < start.getTime() + 7 * DAY_MS
    const prevStart = new Date(start.getTime() - 7 * DAY_MS)
    // The month this week mostly lives in — its midpoint, as WeekPlanHost does.
    const monthStart = monthStartOf(new Date(start.getTime() + 3 * DAY_MS))
    const monthIsCurrent = isCurrentPeriod(periodBounds('month', monthStart, seasons), today)
    const aboveTasks = selectPeriodTasks(layered, 'month', monthStart, monthIsCurrent, meId, seasons).filter((t) => !t.completed)
    return {
      current: weekListTasks(layered, start, meId, { isCurrent }).filter((t) => !t.completed),
      above: offerableFromAbove(aboveTasks, 'month', monthStart, monthIsCurrent, seasons),
      open: lookBackRows(layered, prevStart, meId, 'week').open,
    }
  }
  if (target.level === 'year') {
    return { current: activeGoalsOf(start.getFullYear()), above: [], open: yearLookBack(goals, start.getFullYear() - 1, layers).open }
  }
  const level = target.level
  const bounds = periodBounds(level, start, seasons)
  const isCurrent = isCurrentPeriod(bounds, today)
  const current = selectPeriodTasks(layered, level, bounds.start, isCurrent, meId, seasons).filter((t) => !t.completed)
  let above: ExistingTask[]
  if (level === 'month') {
    const aboveStart = periodBounds('season', bounds.start, seasons).start
    const aboveIsCurrent = isCurrentPeriod(periodBounds('season', aboveStart, seasons), today)
    above = offerableFromAbove(
      selectPeriodTasks(layered, 'season', aboveStart, aboveIsCurrent, meId, seasons).filter((t) => !t.completed),
      'season', aboveStart, aboveIsCurrent, seasons,
    )
  } else {
    // A season looks up at the year, which is goals — reference, never offers.
    above = activeGoalsOf(bounds.start.getFullYear())
  }
  return { current, above, open: lookBackRows(layered, bounds.prev, meId, level, seasons).open }
}
