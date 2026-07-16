// src/lib/routineImport.ts
//
// Client half of the AI routine builder. The edge fn (routine-from-doc)
// validates server-side; this re-validates at the trust boundary (the same
// belt-and-suspenders as parseFacets) and turns a confirmed proposal into
// the CreateRoutineInput calls: parent first, then steps in order.

import type { RecurrencePattern } from '@/types/actionable'

export interface StepProposal { name: string; detail?: string }
export interface RoutineProposal {
  name: string
  recurrence: { type: 'daily' } | { type: 'weekly'; days: string[] }
  timeOfDay: string | null
  timesPerDay: number | null
  steps: StepProposal[]
}

const DAYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])

/** Parse + validate the edge fn's response. Returns null when unusable. */
export function parseRoutineProposal(raw: unknown): RoutineProposal | null {
  if (typeof raw !== 'object' || raw === null) return null
  const p = raw as Record<string, unknown>
  if (typeof p.name !== 'string' || !p.name.trim()) return null
  const rec = p.recurrence as Record<string, unknown> | undefined
  let recurrence: RoutineProposal['recurrence'] = { type: 'daily' }
  if (rec?.type === 'weekly' && Array.isArray(rec.days)) {
    const days = rec.days.filter((d): d is string => typeof d === 'string' && DAYS.has(d.toLowerCase())).map((d) => d.toLowerCase())
    if (days.length > 0) recurrence = { type: 'weekly', days }
  }
  const steps = (Array.isArray(p.steps) ? p.steps : [])
    .map((s): StepProposal | null => {
      if (typeof s !== 'object' || s === null) return null
      const st = s as Record<string, unknown>
      if (typeof st.name !== 'string' || !st.name.trim()) return null
      return {
        name: st.name.trim(),
        detail: typeof st.detail === 'string' && st.detail.trim() ? st.detail.trim() : undefined,
      }
    })
    .filter((s): s is StepProposal => s !== null)
  return {
    name: p.name.trim(),
    recurrence,
    timeOfDay: typeof p.timeOfDay === 'string' && /^\d{2}:\d{2}$/.test(p.timeOfDay) ? p.timeOfDay : null,
    timesPerDay: typeof p.timesPerDay === 'number' && p.timesPerDay >= 2 ? p.timesPerDay : null,
    steps,
  }
}

/** Human-readable schedule line for the preview ("Daily · 7:00" / "Weekly · mon, wed"). */
export function scheduleSummary(p: RoutineProposal): string {
  const base = p.recurrence.type === 'daily' ? 'Daily' : `Weekly · ${p.recurrence.days.join(', ')}`
  const time = p.timeOfDay ? ` · ${p.timeOfDay}` : ''
  const doses = p.timesPerDay ? ` · ${p.timesPerDay}× per day` : ''
  return base + time + doses
}

export interface CreateRoutineLike {
  (input: {
    name: string
    description?: string
    recurrence_pattern?: RecurrencePattern
    time_of_day?: string
    context?: 'work' | 'family' | 'personal'
    parent_routine_id?: string
    step_order?: number
  }): Promise<{ id: string } | null>
}

/** Create the routine tree from a confirmed proposal: parent, then steps in
 *  order (step details ride in description, where the panels show them).
 *  Returns the parent id, or null if the parent failed. */
export async function createFromProposal(
  proposal: RoutineProposal,
  addRoutine: CreateRoutineLike,
  context?: 'work' | 'family' | 'personal',
): Promise<string | null> {
  const pattern: RecurrencePattern = proposal.recurrence.type === 'daily'
    ? { type: 'daily' }
    : { type: 'weekly', days: proposal.recurrence.days }
  // NB: the DB's times_per_day is a string[] of clock times, not a count —
  // we never invent times, so a prescribed dose count rides in the
  // description where the user can see it and set real times later.
  const parent = await addRoutine({
    name: proposal.name,
    recurrence_pattern: pattern,
    time_of_day: proposal.timeOfDay ?? undefined,
    description: proposal.timesPerDay ? `Prescribed ${proposal.timesPerDay}× per day.` : undefined,
    context,
  })
  if (!parent) return null
  for (let i = 0; i < proposal.steps.length; i++) {
    const s = proposal.steps[i]
    await addRoutine({
      name: s.name,
      description: s.detail,
      recurrence_pattern: pattern,
      context,
      parent_routine_id: parent.id,
      step_order: i,
    })
  }
  return parent.id
}

/** File → base64 payload for the edge fn (no data-URL prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
