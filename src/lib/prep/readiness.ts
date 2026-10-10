// src/lib/prep/readiness.ts
//
// "Prepared to act": a well-prepared task answers "what do I do?" and "do I
// have what I need to do it?". This reads what a task already carries — a
// contact, a number, a place, links, files, steps or supplies, notes — and
// what its broader plan carries (the milestone, season goal and yearly
// intention above it), without copying anything into the task.
//
// Pure. `lookup` only answers from rows the reader already has (loaded under
// RLS and the current filters); a parent it cannot find ends the walk, so a
// filtered or private ancestor is never named or read.

import type { Task, TaskLink } from '@/types/task'
import type { Goal } from '@/types/goal'

export type ReadinessKind = 'contact' | 'phone' | 'email' | 'place' | 'link' | 'file' | 'steps' | 'notes'

/** Standard order wherever readiness is shown: who, how to reach, where, what to read, what to do. */
export const READINESS_ORDER: readonly ReadinessKind[] = ['contact', 'phone', 'email', 'place', 'link', 'file', 'steps', 'notes']

export interface ReadinessLookup {
  task: (id: string) => Task | undefined
  goal?: (id: string) => Goal | undefined
  /** Known file count for a task, when the caller has it. */
  files?: (id: string) => number | undefined
  /** Whether a linked contact is visible to the reader (defaults to trusting the id). */
  contactVisible?: (id: string) => boolean
}

export interface OwnReadiness {
  kinds: ReadinessKind[]
  links: number
  files: number
  steps: { total: number; done: number }
}

/** Resources on one ancestor that its descendant does not already carry. */
export interface InheritedResources {
  id: string
  entity: 'task' | 'goal'
  title: string
  notes: string | null
  links: TaskLink[]
  files: number
  contactId: string | null
  location: string | null
  steps: { id: string; title: string; completed: boolean }[]
}

export interface Readiness extends OwnReadiness {
  inherited: InheritedResources[]
}

const LINEAGE_FIELDS = ['sourceId', 'goalTaskId', 'supportsGoalTaskId'] as const

/** The plan item above `t` (milestone above an action, season goal above a milestone). */
export function planParent(t: Task, lookup: ReadinessLookup): Task | undefined {
  for (const field of LINEAGE_FIELDS) {
    const id = t[field]
    if (!id || id === t.id) continue
    const parent = lookup.task(id)
    if (parent) return parent
  }
  return undefined
}

function own(task: Task, lookup: ReadinessLookup): OwnReadiness {
  const links = task.links?.length ?? 0
  const files = lookup.files?.(task.id) ?? 0
  const subtasks = task.subtasks ?? []
  const steps = { total: subtasks.length, done: subtasks.filter((s) => s.completed).length }
  const contact = !!task.contactId && (lookup.contactVisible?.(task.contactId) ?? true)
  const has: Record<ReadinessKind, boolean> = {
    contact,
    phone: !!task.phoneNumber?.trim(),
    email: !!task.email?.trim(),
    place: !!(task.location?.trim() || task.locationPlaceId),
    link: links > 0,
    file: files > 0,
    steps: steps.total > 0,
    notes: !!task.notes?.trim(),
  }
  return { kinds: READINESS_ORDER.filter((k) => has[k]), links, files, steps }
}

/**
 * What `task` carries, and what its plan carries above it.
 * Inherited resources are listed nearest ancestor first; anything the task (or
 * a nearer ancestor) already carries is not listed again, and an ancestor with
 * nothing left to add is left out.
 */
export function readinessOf(task: Task, lookup: ReadinessLookup): Readiness {
  const mine = own(task, lookup)
  const seenLinks = new Set((task.links ?? []).map((l) => l.url))
  const seenContacts = new Set(task.contactId ? [task.contactId] : [])
  const seenPlaces = new Set(task.location?.trim() ? [task.location.trim()] : [])
  const seenIds = new Set([task.id])
  const inherited: InheritedResources[] = []

  let goalId: string | undefined = task.goalId
  let at: Task | undefined = planParent(task, lookup)
  for (let depth = 0; at && depth < 4 && !seenIds.has(at.id); depth++) {
    seenIds.add(at.id)
    goalId = goalId ?? at.goalId
    const links = (at.links ?? []).filter((l) => !seenLinks.has(l.url))
    links.forEach((l) => seenLinks.add(l.url))
    const contactId = at.contactId && !seenContacts.has(at.contactId) && (lookup.contactVisible?.(at.contactId) ?? true) ? at.contactId : null
    if (contactId) seenContacts.add(contactId)
    const place = at.location?.trim() && !seenPlaces.has(at.location.trim()) ? at.location.trim() : null
    if (place) seenPlaces.add(place)
    const entry: InheritedResources = {
      id: at.id, entity: 'task', title: at.title,
      notes: at.notes?.trim() || null,
      links, files: lookup.files?.(at.id) ?? 0, contactId, location: place,
      steps: (at.subtasks ?? []).map((s) => ({ id: s.id, title: s.title, completed: !!s.completed })),
    }
    if (hasAny(entry)) inherited.push(entry)
    at = planParent(at, lookup)
  }

  const goal = goalId ? lookup.goal?.(goalId) : undefined
  if (goal?.notes?.trim()) {
    inherited.push({ id: goal.id, entity: 'goal', title: goal.name, notes: goal.notes.trim(), links: [], files: 0, contactId: null, location: null, steps: [] })
  }
  return { ...mine, inherited }
}

function hasAny(r: InheritedResources): boolean {
  return !!r.notes || r.links.length > 0 || r.files > 0 || !!r.contactId || !!r.location || r.steps.length > 0
}

/** The first lines of a note, for an excerpt. */
export function notesExcerpt(notes: string, lines = 2): { text: string; more: boolean } {
  const all = notes.trim().split(/\r?\n/).filter((l) => l.trim())
  return { text: all.slice(0, lines).join('\n'), more: all.length > lines }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Short phrases for what a task carries: "contact", "2 links", "steps 1 of 3". */
export function describeReadiness(r: OwnReadiness): string[] {
  const out: string[] = []
  for (const k of r.kinds) {
    if (k === 'contact') out.push('contact')
    else if (k === 'phone') out.push('phone')
    else if (k === 'email') out.push('email')
    else if (k === 'place') out.push('place')
    else if (k === 'link') out.push(plural(r.links, 'link'))
    else if (k === 'file') out.push(plural(r.files, 'file'))
    else if (k === 'steps') out.push(`steps ${r.steps.done} of ${r.steps.total}`)
    else if (k === 'notes') out.push('notes')
  }
  return out
}

/** One line for an inherited block: "1 link, steps (3)". */
export function describeInherited(r: InheritedResources): string {
  const out: string[] = []
  if (r.contactId) out.push('contact')
  if (r.location) out.push('place')
  if (r.links.length) out.push(plural(r.links.length, 'link'))
  if (r.files) out.push(plural(r.files, 'file'))
  if (r.steps.length) out.push(`list of ${r.steps.length}`)
  if (r.notes) out.push('notes')
  return out.join(', ')
}
