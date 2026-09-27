// src/lib/paperItemType.ts
//
// The four types a line read off a page can be saved as, and the rules for
// turning one into another on the review sheet. The type is DATA, not a
// label: Task / Appointment / Activity are `tasks.category` ('task' / 'event'
// / 'activity') and Routine is a `routines` row. Pure, so conversions and
// validation are testable without a DOM.

import type { PlanDay, PlanItem } from '@/lib/planParse'
import { parseLocalYmd } from '@/lib/cadence/config'
import { inferTaskVisualKind } from '@/lib/taskVisualKind'

export type PaperItemType = 'task' | 'appointment' | 'activity' | 'routine'
export type PaperTaskCategory = NonNullable<PlanItem['category']>

export const PAPER_ITEM_TYPES: { id: PaperItemType; label: string }[] = [
  { id: 'task', label: 'Task' },
  { id: 'appointment', label: 'Appointment' },
  { id: 'activity', label: 'Activity' },
  { id: 'routine', label: 'Routine' },
]

const CATEGORY_OF: Record<Exclude<PaperItemType, 'routine'>, PaperTaskCategory> = {
  task: 'task',
  appointment: 'event',
  activity: 'activity',
}

const PLAN_DAYS: readonly PlanDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** Does this row get a type selector? Day-facts are notes and a year-goal
 *  line is a `goals` row — neither is one of the four. */
export function hasItemType(item: PlanItem): boolean {
  return item.kind !== 'dayfact' && item.placement.kind !== 'goal'
}

/** The category the badge used to only DISPLAY, guessed from the words. The
 *  sheet stamps it on the row up front so what is shown is what is saved. */
export function inferredCategory(item: Pick<PlanItem, 'title' | 'note'>): PaperTaskCategory {
  const k = inferTaskVisualKind({ title: item.title, note: item.note })
  return k === 'appointment' ? 'event' : k === 'activity' ? 'activity' : 'task'
}

export function itemTypeOf(item: PlanItem): PaperItemType {
  if (item.kind === 'recurring') return 'routine'
  const category = item.category ?? inferredCategory(item)
  return category === 'event' ? 'appointment' : category === 'activity' ? 'activity' : 'task'
}

export interface TypeChange {
  item: PlanItem
  /** Said on the row when the change undid something the user had chosen. */
  notice: string | null
}

/**
 * Turn a row into another type. Title, note, assignee, lineage and the row's
 * placement all ride along (the placement is kept even while it is a routine,
 * so switching back restores it). A goal is a TASK on the month's or season's
 * list, so any other type stops being a goal — and says so.
 */
export function withItemType(item: PlanItem, type: PaperItemType): TypeChange {
  if (!hasItemType(item) || itemTypeOf(item) === type) return { item, notice: null }
  const wasGoal = !!item.goal
  if (type === 'routine') {
    // A dated line keeps its weekday as the routine's first guess.
    const fromDate = item.placement.kind === 'date' ? [PLAN_DAYS[parseLocalYmd(item.placement.date).getDay()]] : []
    const recurring = item.recurring?.days.length ? item.recurring : { days: fromDate, until: item.recurring?.until ?? null }
    return {
      item: { ...item, kind: 'recurring', recurring, goal: false },
      notice: wasGoal ? 'No longer a goal: a routine repeats, a goal is a task on the list.' : null,
    }
  }
  return {
    item: { ...item, kind: 'task', category: CATEGORY_OF[type], goal: type === 'task' ? item.goal : false },
    notice: wasGoal && type !== 'task' ? 'No longer a goal: only a task can be a goal on the list.' : null,
  }
}

/** What stops this row saving as its type, or null. */
export function itemTypeProblem(item: PlanItem): string | null {
  if (item.kind === 'recurring' && !item.recurring?.days.length) return 'Pick the days this routine repeats.'
  return null
}

/**
 * The row as it is written: a task-type row carries no routine pattern, a
 * routine no category, and a time only where it can hang (a day, or a
 * routine) — a time left over from another type is dropped, not saved.
 */
export function normalizeForSave(item: PlanItem): PlanItem {
  if (item.kind === 'recurring') {
    const { category: _category, ...rest } = item
    return { ...rest, goal: false }
  }
  if (item.kind === 'dayfact') return item
  return {
    ...item,
    recurring: null,
    time: item.placement.kind === 'date' ? item.time : null,
    ...(item.placement.kind === 'goal' ? {} : { category: item.category ?? inferredCategory(item) }),
  }
}
