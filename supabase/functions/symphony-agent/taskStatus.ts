// Where a task stands, in the assistant's words, written the way the app's
// week sheet writes it (src/lib/planning/sheetStatus.ts statusWrite and
// src/lib/today/waiting.ts waitingUpdates; Scott, 2026-11-09/10). One choice:
// not started, started, or waiting on someone (with an optional check-back day
// that moves the task to that day, all-day). Who waits on US for it (owed_to)
// and the day it is needed (needed_on) sit beside the status, never instead.
// Pure: the caller reads the row first and writes the patch.

export const TASK_STATUS_PROPERTIES = {
  status: {
    type: 'string',
    enum: ['not_started', 'started', 'waiting'],
    description: 'Where the task stands, as the week sheet shows it. started = in progress. waiting = waiting on someone else (give waiting_for). not_started clears both.',
  },
  waiting_for: { type: 'string', description: 'With status "waiting": who it waits on, in the person\'s words (e.g. "Iris", "the plumber").' },
  check_back: { type: 'string', description: 'With status "waiting", optional YYYY-MM-DD: the day to check back. Moves the task to that day, all-day, as the app does.' },
  owed_to: { type: ['string', 'null'], description: 'Someone waiting on US for this (e.g. "Kaisa"); null clears it. Separate from status.' },
  needed_on: { type: ['string', 'null'], description: 'YYYY-MM-DD the task is needed that day ("need it today"), shown on that day without giving it a time; null clears it.' },
  due_on: { type: ['string', 'null'], description: 'YYYY-MM-DD the task must be done BY (e.g. "return the charger by Monday"). Today shows it from three days before, as "by Mon 16". Not a day to do it: keep scheduled_for for that. null clears it.' },
} as const

export interface StatusBefore {
  is_waiting?: boolean | null
  waiting_since?: string | null
}

const YMD = /^\d{4}-\d{2}-\d{2}$/
const realYmd = (v: unknown): string | null => {
  if (typeof v !== 'string' || !YMD.test(v)) return null
  const d = new Date(`${v}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null
}

/**
 * The tasks columns to write for the status fields in `input`, or an error.
 * Removes the status keys from `input` (they are not columns). `before` is the
 * row as it is now (only needed when status is "waiting", to keep the wait's
 * clock when it is already waiting). `checkBackAt` turns a YYYY-MM-DD into the
 * stored timestamp for that local day (the caller's normalizeSchedule).
 */
export function taskStatusPatch(
  input: Record<string, unknown>,
  before: StatusBefore | null,
  now: Date,
  checkBackAt: (ymd: string) => string,
): { patch: Record<string, unknown> } | { error: string } {
  const patch: Record<string, unknown> = {}
  const { status, waiting_for, check_back } = input
  delete input.status
  delete input.waiting_for
  delete input.check_back
  // The legacy flag: false still clears a wait; true alone names no one, and
  // the app's waits always say who.
  const legacyWaiting = 'is_waiting' in input && status === undefined ? input.is_waiting : undefined
  delete input.is_waiting
  if (legacyWaiting === true) return { error: 'set status "waiting" with waiting_for (who it waits on) instead of is_waiting' }
  if (legacyWaiting === false) Object.assign(patch, { is_waiting: false, waiting_for: null, waiting_since: null })

  if (status !== undefined) {
    if (status === 'started') {
      Object.assign(patch, { started_at: now.toISOString(), is_waiting: false, waiting_for: null, waiting_since: null })
    } else if (status === 'not_started') {
      Object.assign(patch, { started_at: null, is_waiting: false, waiting_for: null, waiting_since: null })
    } else if (status === 'waiting') {
      const who = typeof waiting_for === 'string' ? waiting_for.trim() : ''
      if (!who) return { error: 'status "waiting" needs waiting_for (who it waits on)' }
      Object.assign(patch, { started_at: null, is_waiting: true, waiting_for: who.slice(0, 200) })
      // A new wait stamps the clock; re-wording an existing wait must not reset it.
      if (!before?.is_waiting || !before.waiting_since) patch.waiting_since = now.toISOString()
      if (check_back !== undefined && check_back !== null) {
        const day = realYmd(check_back)
        if (!day) return { error: 'check_back must be a real YYYY-MM-DD date' }
        Object.assign(patch, { bucket: 'timed', scheduled_for: checkBackAt(day), is_all_day: true })
      }
    } else {
      return { error: 'status must be not_started, started or waiting' }
    }
  } else if (waiting_for !== undefined || check_back !== undefined) {
    return { error: 'waiting_for and check_back go with status "waiting"' }
  }

  if ('owed_to' in input) {
    const v = input.owed_to
    patch.owed_to = typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null
    delete input.owed_to
  }
  if ('needed_on' in input) {
    const v = input.needed_on
    if (v === null || v === '') patch.needed_on = null
    else {
      const day = realYmd(v)
      if (!day) return { error: 'needed_on must be a real YYYY-MM-DD date, or null' }
      patch.needed_on = day
    }
    delete input.needed_on
  }
  // The done-by date (tasks.due_on, 2026-11-13), the app's "Due by" field.
  if ('due_on' in input) {
    const v = input.due_on
    if (v === null || v === '') patch.due_on = null
    else {
      const day = realYmd(v)
      if (!day) return { error: 'due_on must be a real YYYY-MM-DD date, or null' }
      patch.due_on = day
    }
    delete input.due_on
  }
  return { patch }
}

/** sort_order writes for a list in the order the person wants, gap-spaced like
 *  the app (src/lib/today/taskOrdering.ts SORT_ORDER_GAP renormalise). */
export const SORT_ORDER_GAP = 1000
export function orderWrites(ids: unknown): { writes: { id: string; sort_order: number }[] } | { error: string } {
  if (!Array.isArray(ids) || ids.length < 2) return { error: 'ids must list at least two task ids, in the new order' }
  if (ids.length > 60) return { error: 'order at most 60 tasks at once' }
  const clean = ids.map((v) => (typeof v === 'string' ? v.trim() : ''))
  if (clean.some((v) => !v)) return { error: 'every id must be a task id' }
  if (new Set(clean).size !== clean.length) return { error: 'an id appears twice' }
  return { writes: clean.map((id, i) => ({ id, sort_order: i * SORT_ORDER_GAP })) }
}
