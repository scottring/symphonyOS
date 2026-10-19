// "Choose" — step 1 of planning a period (spec: 2026-10-19 plan from the
// level above). The lines of the level above, each with its steps and what
// each step is planned for, then what isn't under a line.
//
// Two facts per item, and only the second ever changes when planning:
//   what it is for   — the line it sits under (a subtask's parent, or the row
//                      it was made for: sourceId / goalTaskId)
//   planned for      — Done, a day, this period, last period, or still the
//                      period above ("October": under its line, not in a week)
//
// Pure: the page passes rows it has already filtered for privacy, life area
// and people, and binds the verbs itself.

import type { Task } from '@/types/task'
import type { PlacementLevel } from '@/lib/placement/model'
import { movedOn, taskReviewState, weekReviewState } from './periodReview'
import { compareSortOrder } from '@/lib/today/taskOrdering'
import { isMissedPlacement } from '@/lib/week/missedPlacement'

/** `missed`: given a day this week that has passed, not done — the day is spent. */
export type PlannedKind = 'done' | 'day' | 'missed' | 'here' | 'last' | 'above'
export interface Planned { kind: PlannedKind; label: string }

export interface ChooseNode {
  task: Task
  planned: Planned
  /** Still open on the period before (last week's leftover). */
  fromLast: boolean
  children: ChooseNode[]
}

export interface ChooseLine {
  task: Task
  /** The line's own label: a line can be planned straight onto this period. */
  planned: Planned
  fromLast: boolean
  steps: ChooseNode[]
  counts: { done: number; here: number; above: number; last: number }
}

export type LooseSource = 'last' | 'here' | 'inbox'
export interface LooseItem { task: Task; source: LooseSource; planned: Planned }

export interface ChooseTree {
  lines: ChooseLine[]
  /** Lines already done on the period above: the record, folded at the end. */
  doneLines: ChooseLine[]
  loose: LooseItem[]
}

export interface ChooseInput {
  /** The level above's rows ("October" lines when planning a week). */
  lines: readonly Task[]
  /** Every row the page may show (top level; subtasks ride on `subtasks`). */
  pool: readonly Task[]
  level: Extract<PlacementLevel, 'week' | 'month' | 'season'>
  periodStart: Date
  prevStart: Date
  isCurrent: boolean
  /** "this week", "October" — the label for this period. */
  hereWord: string
  /** "last week", "September". */
  lastWord: string
  /** "October", "Fall" — the label for the level above. */
  aboveWord: string
  /** Inbox captures join "Not under a line" (the Week does this). */
  includeInbox?: boolean
  /** The level above's period ("October" when planning a week): a line moved on from it is left out. */
  aboveStart?: Date
  /** Today, for a day this week that has already passed. */
  now?: Date
}

const DAY_MS = 86_400_000
/** Deep enough for a line › step › broken-down step › its step. */
const MAX_DEPTH = 4

/** When a row was made; a row read without its stamp sorts first. */
const age = (t: Task): number => t.createdAt?.getTime?.() ?? 0

const linkIds = (t: Task): string[] => [t.parentTaskId, t.sourceId, t.goalTaskId].filter((x): x is string => !!x)

export function plannedFor(t: Task, inp: Pick<ChooseInput, 'level' | 'periodStart' | 'prevStart' | 'isCurrent' | 'hereWord' | 'lastWord' | 'aboveWord' | 'now'>): Planned {
  if (t.completed) return { kind: 'done', label: 'Done' }
  const here = inp.level === 'week'
    ? weekReviewState(t, inp.periodStart, { isCurrent: inp.isCurrent })
    : taskReviewState(t, inp.level, inp.periodStart, { isCurrent: inp.isCurrent })
  if (here === 'done') return { kind: 'done', label: 'Done' }
  if (here === 'open') {
    const end = new Date(inp.periodStart.getTime() + 7 * DAY_MS)
    if (inp.level === 'week' && t.scheduledFor && t.scheduledFor >= inp.periodStart && t.scheduledFor < end) {
      const day = t.scheduledFor.toLocaleDateString('en-US', { weekday: 'long' })
      if (isMissedPlacement(t.scheduledFor, !!t.completed, inp.now ?? new Date())) return { kind: 'missed', label: `Was ${day}, not done` }
      return { kind: 'day', label: `${cap(inp.hereWord)} · ${t.scheduledFor.toLocaleDateString('en-US', { weekday: 'short' })}` }
    }
    return { kind: 'here', label: cap(inp.hereWord) }
  }
  const last = inp.level === 'week'
    ? weekReviewState(t, inp.prevStart, { isCurrent: false })
    : taskReviewState(t, inp.level, inp.prevStart, { isCurrent: false })
  if (last === 'open') return { kind: 'last', label: cap(inp.lastWord) }
  return { kind: 'above', label: inp.aboveWord }
}

function cap(s: string): string { return s ? s[0].toUpperCase() + s.slice(1) : s }

export function buildChooseTree(inp: ChooseInput): ChooseTree {
  const lineIds = new Set(inp.lines.map((t) => t.id))
  // A line made under another line (October's "Store originals" under
  // "Organize documents") is that line's step, not a second line. A line moved
  // on to a later period is not this one's to plan from.
  const aboveLevel = inp.level === 'week' ? 'month' : inp.level === 'month' ? 'season' : null
  const lines = inp.lines
    .filter((t) => !linkIds(t).some((id) => id !== t.id && lineIds.has(id)))
    .filter((t) => !aboveLevel || !inp.aboveStart || !movedOn(t, aboveLevel, inp.aboveStart, { isCurrent: inp.isCurrent }))
    // The level above's own order (the Month page's drag order), then age.
    .sort((a, b) => compareSortOrder(a.sortOrder, b.sortOrder) || age(a) - age(b))
  const childrenOf = new Map<string, Task[]>()
  for (const t of inp.pool) {
    for (const id of new Set([t.sourceId, t.goalTaskId].filter((x): x is string => !!x))) {
      if (id === t.id) continue
      const xs = childrenOf.get(id) ?? []
      xs.push(t)
      childrenOf.set(id, xs)
    }
  }
  const placed = new Set<string>()
  const node = (t: Task, depth: number, seen: Set<string>): ChooseNode => {
    placed.add(t.id)
    const planned = plannedFor(t, inp)
    const kids = depth >= MAX_DEPTH ? [] : stepsOf(t).filter((c) => !seen.has(c.id))
    const nextSeen = new Set([...seen, ...kids.map((k) => k.id)])
    return { task: t, planned, fromLast: planned.kind === 'last', children: kids.map((k) => node(k, depth + 1, nextSeen)) }
  }
  const stepsOf = (t: Task): Task[] => {
    const out = new Map<string, Task>()
    for (const s of t.subtasks ?? []) out.set(s.id, s)
    for (const s of childrenOf.get(t.id) ?? []) out.set(s.id, s)
    // Open work first, done at the end, each in the order it was made.
    return [...out.values()].sort((a, b) => Number(!!a.completed) - Number(!!b.completed) || age(a) - age(b))
  }

  const builtLines: ChooseLine[] = lines.map((t) => {
    placed.add(t.id)
    const steps = stepsOf(t).map((s) => node(s, 1, new Set([t.id, s.id])))
    const counts = { done: 0, here: 0, above: 0, last: 0 }
    const walk = (ns: ChooseNode[]) => {
      for (const n of ns) {
        const k = n.planned.kind
        if (k === 'done') counts.done++
        else if (k === 'here' || k === 'day' || k === 'missed') counts.here++
        else if (k === 'last') counts.last++
        else counts.above++
        walk(n.children)
      }
    }
    walk(steps)
    const planned = plannedFor(t, inp)
    return { task: t, planned, fromLast: planned.kind === 'last', steps, counts }
  })

  const loose: LooseItem[] = []
  for (const t of inp.pool) {
    if (placed.has(t.id) || t.completed || t.isGoal) continue
    const planned = plannedFor(t, inp)
    if (planned.kind === 'last') loose.push({ task: t, source: 'last', planned })
    else if (planned.kind === 'here' || planned.kind === 'day' || planned.kind === 'missed') loose.push({ task: t, source: 'here', planned })
    else if (inp.includeInbox && t.bucket === 'inbox') loose.push({ task: t, source: 'inbox', planned: { kind: 'above', label: 'Inbox' } })
  }
  const order: Record<LooseSource, number> = { last: 0, here: 1, inbox: 2 }
  loose.sort((a, b) => order[a.source] - order[b.source]
    || (a.source === 'inbox' ? age(b.task) - age(a.task) : age(a.task) - age(b.task)))
  return {
    lines: builtLines.filter((l) => l.planned.kind !== 'done'),
    doneLines: builtLines.filter((l) => l.planned.kind === 'done'),
    loose,
  }
}

/** "1 done · 2 this week · 4 on October · 1 from last week" — facts, in that order, empties left out. */
export function countsLine(c: ChooseLine['counts'], hereWord: string, aboveWord: string, lastWord: string): string {
  const parts = [
    c.done ? `${c.done} done` : '',
    c.here ? `${c.here} ${hereWord}` : '',
    c.above ? `${c.above} on ${aboveWord}` : '',
    c.last ? `${c.last} from ${lastWord}` : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'No steps'
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'about', 'this', 'that', 'what', 'when', 'make', 'plan', 'get', 'figure', 'out', 'our', 'your', 'kids', 'some', 'more', 'next', 'week', 'month'])
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 5))

/**
 * Drop something in: the line it plainly belongs under, by the words it
 * shares with the line or its steps ("call county records about the birth
 * certificate" → "Organize important family documents" via its steps). One
 * clear best match or none — a tie files it under nothing.
 */
export function lineFor(title: string, lines: readonly ChooseLine[]): ChooseLine | null {
  const want = new Set(words(title))
  if (want.size === 0) return null
  const textOf = (l: ChooseLine): string[] => {
    const out = [l.task.title]
    const walk = (ns: ChooseNode[]) => { for (const n of ns) { out.push(n.task.title); walk(n.children) } }
    walk(l.steps)
    return out
  }
  let best: ChooseLine | null = null
  let bestScore = 0
  let tie = false
  for (const l of lines) {
    const have = new Set(textOf(l).flatMap(words))
    let score = 0
    for (const w of want) if (have.has(w)) score++
    if (score > bestScore) { best = l; bestScore = score; tie = false }
    else if (score === bestScore && score > 0) tie = true
  }
  return bestScore > 0 && !tie ? best : null
}
