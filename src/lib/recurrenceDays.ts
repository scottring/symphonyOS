// src/lib/recurrenceDays.ts
//
// A weekly routine's days are the three-letter keys the whole app reads —
// 'sun' … 'sat' (quickRecurrence DAY_KEYS, routineUtils, the day pickers).
// Two writers produced full names instead: the assistant's
// symphony_create_routine ("tuesday") and routine-from-doc ("monday", …), so
// a routine for "every Tuesday at 3" matched no day and never showed
// (Scott, 2026-09-29). Rows are normalized where they enter the app; the
// writers are fixed too.

import type { RecurrencePattern } from '@/types/actionable'

const KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

/** 'Tuesday' / 'tues' / 'TUE' → 'tue'; anything else → null. */
export function normalizeDayKey(d: unknown): string | null {
  if (typeof d !== 'string') return null
  const k = d.trim().toLowerCase().slice(0, 3)
  return (KEYS as readonly string[]).includes(k) ? k : null
}

/** The same routine with its days as keys (deduped, in week order). */
export function withDayKeys<T extends { recurrence_pattern?: RecurrencePattern | null }>(r: T): T {
  const p = r.recurrence_pattern
  if (!p || !Array.isArray(p.days) || p.days.length === 0) return r
  const keys = new Set(p.days.map(normalizeDayKey).filter((k): k is string => !!k))
  const days = KEYS.filter((k) => keys.has(k))
  if (days.length === p.days.length && days.every((k, i) => k === p.days![i])) return r
  return { ...r, recurrence_pattern: { ...p, days } }
}
