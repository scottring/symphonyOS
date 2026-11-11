// The meal plan's slots and days, shared by the two meal agents: Symphony's
// meal tools (symphony-agent/meals.ts) and the Meals page's chat
// (meal-planner-chat). They used to disagree: the main agent offered snack
// and prep, which the table refuses, and the meal chat could only name a
// weekday. Both now read the slots and dates from here.
//
// Storage, verified against the live schema (2026-11-11):
// - meal_plan_entries.slot CHECK (slot in ('breakfast','lunch','dinner'))
//   (migration 2026-07-18_meal_teardown.sql; the same set as
//   src/types/meal-planner.ts DAY_MEAL_SLOTS).
// - meal_plans.week_start is the date's Sunday; day_of_week is 0 = Sunday ..
//   6 = Saturday (Date.getDay()), CHECK 0..6.
// All dates are YYYY-MM-DD and the math is UTC, so no timezone drifts a day.

/** The slots the table accepts. Writing any other fails its CHECK. */
export const STORED_MEAL_SLOTS = ['breakfast', 'lunch', 'dinner'] as const
export type StoredMealSlot = typeof STORED_MEAL_SLOTS[number]

export function isStoredMealSlot(v: unknown): v is StoredMealSlot {
  return typeof v === 'string' && (STORED_MEAL_SLOTS as readonly string[]).includes(v)
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** A real calendar date in YYYY-MM-DD, else null ("2026-02-30" is null). */
export function parseIsoDate(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!ISO.test(s)) return null
  const d = new Date(`${s}T12:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s
}

/** "Today", "tonight", "tomorrow" or a YYYY-MM-DD, against the user's today.
 *  Empty means today. */
export function resolveDate(raw: unknown, today: string): string | null {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (!s || s === 'today' || s === 'tonight') return today
  if (s === 'tomorrow') return addDays(today, 1)
  return parseIsoDate(s)
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The stored plan week (its Sunday) and weekday (0 = Sunday) of a date. */
export function weekOf(iso: string): { weekStart: string; dayOfWeek: number } {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay()
  return { weekStart: addDays(iso, -dow), dayOfWeek: dow }
}
