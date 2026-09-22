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

import type { PageAltitude } from '@/lib/planParse'
import type { PageReviewPayload } from '@/components/capture/PageReviewSheet'
import type { NewItem, SessionDraft, SessionLevel } from './session'
import { readDraft } from './sessionDraft'
import { findLikelyDuplicate, type ExistingTask } from '@/lib/planDuplicates'
import { localYmd, readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { seasonLabel, type Seasons } from '@/lib/cadence/seasons'
import { formatWeekRangeShort } from '@/lib/dateHelpers'
import { planningPeriod } from './periodPage'

export interface DraftTarget {
  level: SessionLevel
  /** Local YYYY-MM-DD — the draft's key, as the session pages write it. */
  periodStart: string
  /** The period as that page names it: "this week", "October", "Fall 2026", "2027". */
  label: string
}

const DAY_MS = 86_400_000

/** From Nov 20 a year page is planning NEXT year (the nudge's rule). */
const YEAR_TURNS_ON = { month: 10, date: 20 }

/** The (level, periodStart) a page of this altitude would plan, and what that
 *  period is called. A week page on a Saturday or Sunday is the week ahead —
 *  that is when the week gets planned. */
function targetPeriod(altitude: PageAltitude, now: Date, seasons: Seasons): { level: SessionLevel; start: Date; label: string } {
  if (altitude === 'week') {
    const { weekStartsOn } = readCadenceConfig()
    const thisWeek = weekStartAnchor(now, weekStartsOn)
    const day = now.getDay()
    // +2 days lands in the next week from a Saturday or Sunday whatever the
    // configured week start is (a Sunday-start week has already turned over).
    const start = day === 6 || day === 0 ? weekStartAnchor(new Date(now.getTime() + 2 * DAY_MS), weekStartsOn) : thisWeek
    const label = start.getTime() === thisWeek.getTime() ? 'this week' : `the week of ${formatWeekRangeShort(start)}`
    return { level: 'week', start, label }
  }
  if (altitude === 'year') {
    const turned = now.getMonth() > YEAR_TURNS_ON.month
      || (now.getMonth() === YEAR_TURNS_ON.month && now.getDate() >= YEAR_TURNS_ON.date)
    const year = now.getFullYear() + (turned ? 1 : 0)
    return { level: 'year', start: new Date(year, 0, 1), label: `${year}` }
  }
  const level = altitude === 'season' ? 'season' : 'month'
  // The period the page for this level opens on — the same question
  // PeriodPlanPage asks. No list to count here: the calendar decides.
  const { start } = planningPeriod({ level, today: now, seasons, countFor: () => 0 })
  const label = level === 'season'
    ? seasonLabel(start, seasons)
    : start.toLocaleDateString('en-US', { month: 'long' })
  return { level, start, label }
}

/**
 * The draft a page of this altitude would join, or null when there is no
 * session in progress for that period — the offer only appears over a plan
 * you are actually writing.
 */
export function draftTargetFor(altitude: PageAltitude, now: Date, seasons: Seasons, userId: string | null): DraftTarget | null {
  const { level, start, label } = targetPeriod(altitude, now, seasons)
  const periodStart = localYmd(start)
  if (!readDraft(userId, level, periodStart)) return null
  return { level, periodStart, label }
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
