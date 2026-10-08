// src/lib/firstSuccess.ts
//
// After the first thing. A brand-new household sees "Where would you like to
// start?" on an empty Today, and the moment the first task lands that panel
// (rightly) goes — but it used to leave nothing behind: no word that the
// task was saved, and the "Plan with guidance" door vanished with it
// (walkthrough 2026-10-08). This is the quiet line that replaces it.
//
// Who sees it: only an account that was actually OFFERED the start panel on
// an empty planner. That offer is recorded here, per user, in localStorage —
// the same place the start panel's own "Explore on my own" lives
// (FIRST_WEEK_HIDE_KEY), since there is no account-level preferences store
// for it. An established account that never saw the start panel has no
// record and never sees the line.
//
// It is optional and it ends: "I'm set" or taking one of the planning steps
// retires it for good, and it lapses on its own a fortnight after the offer
// so an ignored line never becomes furniture.

import type { Task } from '@/types/task'

export const FIRST_SUCCESS_KEY = (uid: string) => `symphony.firstSuccess.${uid}`

/** Days after the start panel was first offered that the follow-up may show. */
export const FIRST_SUCCESS_WINDOW_DAYS = 14

/** null: never offered. offeredAt: the start panel was shown to an empty
 *  planner. 'done': dismissed or acted on — never again. */
export type FirstSuccessRecord = { offeredAt: string } | 'done' | null

export function readFirstSuccess(uid: string): FirstSuccessRecord {
  try {
    const raw = localStorage.getItem(FIRST_SUCCESS_KEY(uid))
    if (!raw) return null
    if (raw === 'done') return 'done'
    return Number.isNaN(Date.parse(raw)) ? null : { offeredAt: raw }
  } catch {
    return null
  }
}

/** Record the first offer. An existing record (an earlier offer, or 'done')
 *  is kept as it is. Returns what is now recorded. */
export function markFirstSuccessOffered(uid: string, now: Date = new Date()): FirstSuccessRecord {
  const existing = readFirstSuccess(uid)
  if (existing) return existing
  const offeredAt = now.toISOString()
  try { localStorage.setItem(FIRST_SUCCESS_KEY(uid), offeredAt) } catch { /* private mode: shows this session only */ }
  return { offeredAt }
}

export function markFirstSuccessDone(uid: string): void {
  try { localStorage.setItem(FIRST_SUCCESS_KEY(uid), 'done') } catch { /* ignore */ }
}

export function shouldShowFirstSuccess(input: {
  record: FirstSuccessRecord
  /** Tasks have finished loading without error. */
  ready: boolean
  taskCount: number
  /** The start panel itself is showing (e.g. reopened via ?welcome=1). */
  startOpen: boolean
  /** "Explore on my own" was chosen — that hides everything. */
  startHidden: boolean
  now: Date
}): boolean {
  const { record } = input
  if (!record || record === 'done') return false
  if (!input.ready || input.taskCount === 0 || input.startOpen || input.startHidden) return false
  const ageMs = input.now.getTime() - Date.parse(record.offeredAt)
  return ageMs < FIRST_SUCCESS_WINDOW_DAYS * 86400000
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** Where the household's first task was saved, as the end of "Your first
 *  thing is …". Plain words for the place a person would go to find it. */
export function whereFirstThingIs(tasks: Task[], today: Date = new Date()): string {
  if (tasks.length === 0) return 'saved'
  const first = tasks.reduce((a, b) => (new Date(b.createdAt).getTime() < new Date(a.createdAt).getTime() ? b : a))
  if (first.plannedOn && sameDay(new Date(first.plannedOn), today)) return 'on Today'
  if (first.scheduledFor) {
    const d = new Date(first.scheduledFor)
    if (sameDay(d, today)) return 'on Today'
    return `on ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`
  }
  switch (first.bucket) {
    case 'inbox': return 'in Inbox'
    case 'week': return 'in this week’s plan'
    case 'month': return 'in this month’s plan'
    case 'quarter': return 'in this season’s plan'
    case 'someday': return 'in Someday'
    default: return 'saved'
  }
}
