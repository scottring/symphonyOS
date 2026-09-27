// src/lib/paperItemType.ts
//
// The five things a line read off a page can be saved as — "What is this?" on
// the review sheet — and the rules for turning one into another. The type is
// DATA, not a label:
//   Goal or project → a year `goals` row (placement 'goal', year pages), or
//                     `is_goal` on a month's or season's list (goal: true)
//   Action / task   → tasks.category 'task'
//   Appointment     → tasks.category 'event' (on a day)
//   Activity        → tasks.category 'activity'
//   Routine         → a `routines` row
// Pure, so conversions and validation are testable without a DOM.

import type { PageAltitude, PlanDay, PlanItem, PlanPlacement, PlanRecurring } from '@/lib/planParse'
import { parseLocalYmd } from '@/lib/cadence/config'
import { inferTaskVisualKind } from '@/lib/taskVisualKind'

export type PaperItemType = 'goal' | 'task' | 'appointment' | 'activity' | 'routine'
export type PaperTaskCategory = NonNullable<PlanItem['category']>

export const PAPER_ITEM_TYPES: { id: PaperItemType; label: string }[] = [
  { id: 'goal', label: 'Goal or project' },
  { id: 'task', label: 'Action / task' },
  { id: 'appointment', label: 'Appointment' },
  { id: 'activity', label: 'Activity' },
  { id: 'routine', label: 'Routine' },
]

const CATEGORY_OF: Record<'task' | 'appointment' | 'activity', PaperTaskCategory> = {
  task: 'task',
  appointment: 'event',
  activity: 'activity',
}

const PLAN_DAYS: readonly PlanDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** The fields that belong to ONE type — where and when it is. A row keeps a
 *  copy for each type it has been, so switching back restores what was set. */
export interface TypeFields {
  placement: PlanPlacement
  time: string | null
  recurring: PlanRecurring | null
  category?: PaperTaskCategory
  goal?: boolean
}
export type TypeDrafts = Partial<Record<PaperItemType, TypeFields>>
export type TypedItem = PlanItem & { typeDrafts?: TypeDrafts }

/** Does this row get a type selector? Only a day-fact (a note) does not. */
export function hasItemType(item: PlanItem): boolean {
  return item.kind !== 'dayfact'
}

/** The category the badge used to only DISPLAY, guessed from the words. The
 *  sheet stamps it on the row up front so what is shown is what is saved. */
export function inferredCategory(item: Pick<PlanItem, 'title' | 'note'>): PaperTaskCategory {
  const k = inferTaskVisualKind({ title: item.title, note: item.note })
  return k === 'appointment' ? 'event' : k === 'activity' ? 'activity' : 'task'
}

export function isGoalRow(item: PlanItem): boolean {
  return item.kind === 'task' && (item.placement.kind === 'goal' || item.goal === true)
}

export function itemTypeOf(item: PlanItem): PaperItemType {
  if (isGoalRow(item)) return 'goal'
  if (item.kind === 'recurring') return 'routine'
  const category = item.category ?? inferredCategory(item)
  return category === 'event' ? 'appointment' : category === 'activity' ? 'activity' : 'task'
}

/** A goal sits on a list, never on a day: the page's own list, or the month's
 *  on a week page (a week holds actions, not goals). A year page's goal is a
 *  `goals` row. */
export function goalPlacementFor(altitude: PageAltitude, current: PlanPlacement): PlanPlacement {
  if (current.kind === 'goal' || current.kind === 'month' || current.kind === 'season') return current
  return altitude === 'year' ? { kind: 'goal' } : altitude === 'season' ? { kind: 'season' } : { kind: 'month' }
}

/** Where a line lands when it stops being a goal and has no earlier place to
 *  go back to: a month/season goal stays on its list; a year goal goes to
 *  Someday (a year page has no days and no week). */
function actionPlacementFrom(current: PlanPlacement): PlanPlacement {
  return current.kind === 'goal' ? { kind: 'someday' } : current
}

function fieldsOf(item: PlanItem): TypeFields {
  return {
    placement: item.placement,
    time: item.time,
    recurring: item.recurring,
    ...(item.category ? { category: item.category } : {}),
    ...(item.goal !== undefined ? { goal: item.goal } : {}),
  }
}

function fresh(item: PlanItem, type: PaperItemType, altitude: PageAltitude): PlanItem {
  if (type === 'goal') {
    const placement = goalPlacementFor(altitude, item.placement)
    return {
      ...item, kind: 'task', placement, time: null, recurring: null, category: 'task',
      goal: placement.kind !== 'goal',
    }
  }
  const placement = actionPlacementFrom(item.placement)
  if (type === 'routine') {
    // A dated line keeps its weekday as the routine's first guess.
    const fromDate = placement.kind === 'date' ? [PLAN_DAYS[parseLocalYmd(placement.date).getDay()]] : []
    const recurring = item.recurring?.days.length ? item.recurring : { days: fromDate, until: item.recurring?.until ?? null }
    const { category: _category, ...rest } = item
    return { ...rest, kind: 'recurring', placement, recurring, goal: false }
  }
  return {
    ...item, kind: 'task', placement, category: CATEGORY_OF[type], goal: false,
    time: placement.kind === 'date' ? item.time : null,
  }
}

/**
 * Turn a row into another type. Title, note, person, lineage and inclusion
 * ride along untouched; the where-and-when of the type being left is kept on
 * the row (typeDrafts), and a type the row has been before gets its own back.
 * Nothing incompatible is carried: a goal has no day, time or pattern.
 */
export function withItemType<T extends TypedItem>(item: T, type: PaperItemType, altitude: PageAltitude): T {
  if (!hasItemType(item)) return item
  const from = itemTypeOf(item)
  if (from === type) return item
  const typeDrafts: TypeDrafts = { ...item.typeDrafts, [from]: fieldsOf(item) }
  const saved = typeDrafts[type]
  const base: PlanItem = saved
    ? { ...item, ...saved, kind: type === 'routine' ? 'recurring' : 'task' }
    : fresh(item, type, altitude)
  // A restored draft may carry a field another type added since: settle it.
  const next: PlanItem = type === 'routine'
    ? (({ category: _c, ...r }) => ({ ...r, goal: false }))(base)
    : type === 'goal' ? { ...base, category: 'task', time: null, recurring: null }
      : { ...base, category: CATEGORY_OF[type], goal: false }
  return { ...(item as T), ...next, typeDrafts } as T
}

/** What stops this row saving as its type, or null. */
export function itemTypeProblem(item: PlanItem): string | null {
  const type = itemTypeOf(item)
  if (type === 'routine' && !item.recurring?.days.length) return 'Pick the days this routine repeats.'
  if (type === 'appointment' && item.placement.kind !== 'date') return 'Pick the day of this appointment.'
  return null
}

/**
 * The row as it is written, for its type only: a goal carries no day, time or
 * pattern; a routine no category and never a goal; an action no pattern, and
 * a time only on a day. Drafts kept for other types are dropped.
 */
export function normalizeForSave(input: TypedItem): PlanItem {
  const { typeDrafts: _drafts, ...item } = input
  if (item.kind === 'dayfact') return item
  const type = itemTypeOf(item)
  if (type === 'routine') {
    const { category: _category, ...rest } = item
    return { ...rest, goal: false }
  }
  if (type === 'goal') {
    return item.placement.kind === 'goal'
      ? (({ category: _c, goal: _g, ...r }) => ({ ...r, time: null, recurring: null }))(item)
      : { ...item, goal: true, category: 'task', time: null, recurring: null }
  }
  return {
    ...item,
    goal: false,
    recurring: null,
    time: item.placement.kind === 'date' ? item.time : null,
    category: CATEGORY_OF[type],
  }
}
