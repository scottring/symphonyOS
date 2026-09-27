// src/lib/planning/existingActions.ts
//
// "Add an existing action" under a goal: which tasks may be filed there, how
// each is told apart from another with the same words, and what filing it
// does and does not change. Pure, so the picker's rules are testable.
//
// The relationship is the one next actions already use — `tasks.goal_task_id`
// on the ACTION, pointing at an is_goal task (goalSteps.ts). Filing an
// existing action writes that one column and nothing else: its notes, people,
// area, privacy, dates, week/month commitments, focus and completion stay as
// they are. A column holds one goal, so an action already under another goal
// is MOVED, and only after the person says so.
//
// Year goals (the `goals` table) have no next actions: `tasks.goal_id` is how
// a SEASON GOAL supports a year goal, not a step relationship, and nothing
// lists tasks under a year goal. So this is offered on month and season goals
// only.

import type { Task } from '@/types/task'
import { DOMAINS } from '@/lib/domains'
import { taskWhenParts } from '@/lib/planning/taskWhen'

export type CandidateState = 'free' | 'here' | 'elsewhere'

export interface ExistingActionCandidate {
  task: Task
  /** free: under no goal; here: already under this goal; elsewhere: under another. */
  state: CandidateState
  /** The goal it is under now, when that goal is one the reader can see. */
  currentGoal: { id: string; title: string } | null
  /** Where it lives — "Week of Oct 5 · October", "Inbox", "Someday". */
  where: string
  /** Its life area, or "No area". */
  area: string
  /** Who it is for, by first name, or null when nobody is named. */
  who: string | null
  /** Said when two candidates read the same: when it was written. */
  added: string | null
  /** Filing it here keeps its privacy; this says what that means, if anything. */
  privacyNote: string | null
}

export interface CandidateResult {
  shown: ExistingActionCandidate[]
  /** Every match, before the display bound — "Showing 50 of 212". */
  total: number
}

/** Shown before the list says "keep typing". A bound, not a cap: the count is said. */
export const CANDIDATE_LIMIT = 50

type Member = { id: string; name: string }

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Can this task be filed under a goal at all? Open, one-level actions only. */
export function isEligibleAction(t: Task, goalId: string): boolean {
  return t.id !== goalId && t.isGoal !== true && !t.completed && !t.parentTaskId
}

/** Is this goal row shared with the household (others may see it)? */
function isShared(t: Pick<Task, 'scope' | 'context'>): boolean {
  return t.scope === 'couple' || t.scope === 'compound' || (!t.scope && t.context === 'family')
}

function whereOf(t: Task): string {
  const parts = taskWhenParts(t)
  if (parts.length) return parts.join(' · ')
  if (t.bucket === 'someday') return 'Someday'
  if (t.bucket === 'inbox' || !t.bucket) return 'Inbox'
  return 'No date yet'
}

function areaOf(t: Task): string {
  return DOMAINS.find((d) => d.id === t.context)?.label ?? 'No area'
}

function whoOf(t: Task, members: readonly Member[]): string | null {
  const ids = t.assignedToAll?.length ? t.assignedToAll : t.assignedTo ? [t.assignedTo] : []
  const names = ids.map((id) => members.find((m) => m.id === id)?.name.split(' ')[0]).filter(Boolean)
  return names.length ? names.join(', ') : null
}

/** How well a title answers the query: 0 = starts with it, 1 = a word does, 2 = contains it. */
function rank(title: string, q: string): number | null {
  if (!q) return 0
  const t = norm(title)
  if (t.startsWith(q)) return 0
  if (t.split(' ').some((w) => w.startsWith(q))) return 1
  return t.includes(q) ? 2 : null
}

/**
 * The actions this goal could take, best match first. Only rows the reader
 * already holds are searched — `tasks` is what RLS let this person load — so
 * nothing private to someone else can be offered. Rows already under this
 * goal are listed, marked, so the person sees why they are not addable.
 */
export function existingActionCandidates(
  goal: Pick<Task, 'id' | 'scope' | 'context'>,
  tasks: readonly Task[],
  query: string,
  members: readonly Member[] = [],
  limit: number = CANDIDATE_LIMIT,
): CandidateResult {
  const q = norm(query)
  const goalsById = new Map(tasks.filter((t) => t.isGoal).map((t) => [t.id, t]))
  const matches: { c: ExistingActionCandidate; r: number }[] = []
  for (const t of tasks) {
    if (!isEligibleAction(t, goal.id)) continue
    const r = rank(t.title, q)
    if (r === null) continue
    const parent = t.goalTaskId ? goalsById.get(t.goalTaskId) ?? null : null
    const state: CandidateState = !t.goalTaskId ? 'free' : t.goalTaskId === goal.id ? 'here' : 'elsewhere'
    matches.push({
      r,
      c: {
        task: t,
        state,
        currentGoal: parent ? { id: parent.id, title: parent.title } : null,
        where: whereOf(t),
        area: areaOf(t),
        who: whoOf(t, members),
        added: null,
        privacyNote: isShared(goal) && !isShared(t)
          ? 'Private: it stays private. Others who can see this goal will not see it.'
          : null,
      },
    })
  }
  const order: Record<CandidateState, number> = { free: 0, elsewhere: 1, here: 2 }
  matches.sort((a, b) => a.r - b.r || order[a.c.state] - order[b.c.state]
    || a.c.task.title.localeCompare(b.c.task.title) || b.c.task.createdAt.getTime() - a.c.task.createdAt.getTime())
  // Same words, different tasks: say when each was written, so the choice is
  // not a guess between two identical lines.
  const byTitle = new Map<string, number>()
  for (const { c } of matches) byTitle.set(norm(c.task.title), (byTitle.get(norm(c.task.title)) ?? 0) + 1)
  const dayOf = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const sameDay = new Map<string, number>()
  for (const { c } of matches) {
    const k = `${norm(c.task.title)}|${dayOf(c.task.createdAt)}`
    sameDay.set(k, (sameDay.get(k) ?? 0) + 1)
  }
  for (const { c } of matches) {
    if ((byTitle.get(norm(c.task.title)) ?? 0) > 1) {
      const d = c.task.createdAt
      // Written the same day: the time is what tells them apart.
      c.added = (sameDay.get(`${norm(c.task.title)}|${dayOf(d)}`) ?? 0) > 1
        ? `Added ${dayOf(d)}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
        : `Added ${dayOf(d)}`
    }
  }
  return { shown: matches.slice(0, limit).map((m) => m.c), total: matches.length }
}


/** An action linked to this goal that is not on the page's own list — say where it lives. */
export function offPeriodSteps(goalId: string, tasks: readonly Task[], onPage: ReadonlySet<string>): Task[] {
  return tasks
    .filter((t) => t.goalTaskId === goalId && !t.isGoal && !onPage.has(t.id))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
}

export { whereOf as actionWhereLabel }

/**
 * What a goal-link write actually did. A write can fail, be refused, find the
 * link changed under it, or lose its RESPONSE after committing — so a write
 * that did not come back clean is never reported from what was sent: the row
 * is read again and the answer comes from the database.
 */
export type LinkOutcome =
  | { status: 'ok' }
  /** Someone else changed which goal it is under since it was shown here. */
  | { status: 'conflict'; currentGoalId: string | null }
  /** Read back unchanged: nothing was written. */
  | { status: 'failed' }
  /** Could not even read it back: whether it saved is not known. */
  | { status: 'unknown' }

/**
 * Decide the outcome of `set goal_task_id = target where goal_task_id =
 * expected`. `wrote` is whether the write came back with its row; `reread` is
 * the row's goal_task_id read afterwards (null = no goal), or undefined when
 * the read-back itself failed.
 */
export function linkOutcome(
  wrote: boolean,
  target: string | null,
  expected: string | null,
  reread?: { goalTaskId: string | null } | undefined,
): LinkOutcome {
  if (wrote) return { status: 'ok' }
  if (!reread) return { status: 'unknown' }
  // The response was lost but the write landed (or it already said so).
  if (reread.goalTaskId === target) return { status: 'ok' }
  if (reread.goalTaskId !== expected) return { status: 'conflict', currentGoalId: reread.goalTaskId }
  return { status: 'failed' }
}

/** What to say after "Remove from goal", from what the database says happened. */
export function removeOutcomeToast(title: string, out: LinkOutcome): [string, 'success' | 'error' | 'warning'] {
  if (out.status === 'ok') return [`“${title}” is no longer a next action for that goal. The task itself is unchanged.`, 'success']
  if (out.status === 'conflict') return [`Not changed: someone else moved “${title}” to ${out.currentGoalId === null ? 'no goal' : 'another goal'} meanwhile.`, 'warning']
  if (out.status === 'unknown') return [`Couldn’t confirm whether “${title}” was removed from its goal — the connection dropped.`, 'warning']
  return [`Could not remove “${title}” from its goal. Nothing was changed.`, 'error']
}
