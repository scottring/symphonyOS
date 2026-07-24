// src/lib/planning/coachLines.ts
//
// Layer 1 of the session guide: deterministic coach lines. Pure functions
// over data the GuidedHost already holds — no network, no model, no latency.
// Each line is one honest observation the narration can't make because the
// narration is a script and these are computed from the user's actual lists.
// A warm guide, not a gate: lines never block; when nothing is worth saying,
// say nothing.

import type { Task, TaskBucket } from '@/types/task'
import type { Goal } from '@/types/goal'
import type { Project } from '@/types/project'
import { goalsWithoutMoves } from '@/lib/planning/lineage'
import { weekSizedMoves, clusterMoves } from '@/lib/planning/moveGrain'

export type CoachTone = 'nudge' | 'ok'

export interface CoachLine {
  id: string
  tone: CoachTone
  text: string
}

export interface CoachInput {
  stepType: string
  /** The bucket this step reads/writes (review/write-list), if any. */
  bucket?: TaskBucket
  /** look-above target: a bucket or 'goals'. */
  aboveBucket?: TaskBucket | 'goals'
  tasks: readonly Task[]
  goals: readonly Goal[]
  projects: readonly Project[]
}

const CARRY_THRESHOLD = 3
const list = (names: string[], max = 2): string => {
  const shown = names.slice(0, max).map((n) => `“${n}”`).join(', ')
  return names.length > max ? `${shown}, +${names.length - max} more` : shown
}

/** The one fun-audit read (Best Laid Plans: aim for 2 fun : 1 obligation).
 *  Exported for the write-list tally UI so the chip and the line agree. */
export function funRatio(pool: readonly Task[]): { fun: number; obligation: number; met: boolean } {
  let fun = 0
  for (const t of pool) if (t.isFun) fun += 1
  const obligation = pool.length - fun
  // The book's bar is aspirational; the honest floor we nudge toward is at
  // least 1 fun per 2 obligations once a list has any real size.
  return { fun, obligation, met: pool.length === 0 || fun * 2 >= obligation }
}

export function computeCoachLines(input: CoachInput): CoachLine[] {
  const lines: CoachLine[] = []
  const open = (bucket: TaskBucket) =>
    input.tasks.filter((t) => !t.completed && t.bucket === bucket)

  // ── Review steps: name the perpetual carriers. deferCount already counts
  // every push; three or more means the item, not the week, is the problem. ──
  if (input.stepType === 'review' && input.bucket) {
    const stale = open(input.bucket).filter((t) => (t.deferCount ?? 0) >= CARRY_THRESHOLD)
    if (stale.length > 0) {
      lines.push({
        id: 'stale-carries',
        tone: 'nudge',
        text: `${stale.length === 1 ? 'One item has' : `${stale.length} items have`} been pushed ${CARRY_THRESHOLD}+ times — ${list(stale.map((t) => t.title))}. Make ${stale.length === 1 ? 'it' : 'them'} smaller, hand ${stale.length === 1 ? 'it' : 'them'} off, or park ${stale.length === 1 ? 'it' : 'them'} without guilt.`,
      })
    }
  }

  // ── Month review: the grain check. A month list quietly fills with single
  // sittings; naming the count once (the rows carry the per-item hint and the
  // one-tap push) is the honest observation the narration can't make. ──
  if (input.stepType === 'review' && input.bucket === 'month') {
    const clusters = clusterMoves(input.tasks)
    const clustered = new Set(clusters.flatMap((c) => c.taskIds))
    const flagged = weekSizedMoves(input.tasks)
    // A cluster is named ONCE, as the move it is — listing its seven steps
    // here would repeat on screen exactly what the collapsed row already says.
    const clusterPhrases = clusters.map((c) => {
      const name = input.projects.find((p) => p.id === c.projectId)?.name ?? 'one project'
      return `“${name}” has ${c.taskIds.length} steps on the list — that's one move`
    })
    const loose = input.tasks.filter((t) => flagged.has(t.id) && !clustered.has(t.id))
    const parts: string[] = [...clusterPhrases]
    if (loose.length > 0) {
      parts.push(`${loose.length} ${loose.length === 1 ? 'item reads' : 'items read'} like a single sitting — ${list(loose.map((t) => t.title))}`)
    }
    if (parts.length > 0) {
      lines.push({
        id: 'week-sized-moves',
        tone: 'nudge',
        text: `${parts.join('; ')}. A month move is one chunk that ends in a result; the steps belong on a week.`,
      })
    }
  }

  // ── Seasonal look-at-year: which goals has no season ever touched? Reads
  // the goalId thread, so it gets sharper as lineage accumulates. ──
  if (input.stepType === 'look-above' && input.aboveBucket === 'goals') {
    const active = input.goals.filter((g) => g.status === 'active')
    if (active.length > 0) {
      const bare = goalsWithoutMoves(active, input.tasks, 'quarter')
      if (bare.length === 0) {
        lines.push({ id: 'goals-covered', tone: 'ok', text: 'Every year goal has at least one move on a season list. That is the whole system, working.' })
      } else if (bare.length < active.length) {
        lines.push({
          id: 'goals-bare',
          tone: 'nudge',
          text: `${bare.length} of ${active.length} year goals ${bare.length === 1 ? 'has' : 'have'} nothing on a season list yet — ${list(bare.map((g) => g.name))}. Promote one below, or let it wait deliberately.`,
        })
      }
      // All bare (fresh year) → the empty state speaks for itself; stay quiet.
    }
  }

  // ── Write-list: the fun audit, live. Only worth saying once a list exists. ──
  if (input.stepType === 'write-list' && input.bucket) {
    const pool = open(input.bucket)
    const { fun, obligation, met } = funRatio(pool)
    if (pool.length >= 3) {
      lines.push(
        met
          ? { id: 'fun-ok', tone: 'ok', text: `Fun check: ${fun} fun · ${obligation} obligation. A list you'll actually want to live.` }
          : { id: 'fun-low', tone: 'nudge', text: `Fun check: ${fun} fun · ${obligation} obligation — the book's target is 2 : 1. Tap the ✨ on anything that makes you smile, or add one thing purely because you want to.` },
      )
    }
  }

  // ── Projects step: projects in motion that this level is ignoring. ──
  if (input.stepType === 'projects' && input.bucket) {
    const pool = open(input.bucket)
    const covered = new Set(pool.map((t) => t.projectId).filter(Boolean))
    const idle = input.projects.filter((p) => p.status === 'in_progress' && !covered.has(p.id))
    if (idle.length > 0 && input.projects.length > 0) {
      lines.push({
        id: 'idle-projects',
        tone: 'nudge',
        text: `${idle.length === 1 ? 'One project in motion has' : `${idle.length} projects in motion have`} nothing on this list — ${list(idle.map((p) => p.name))}. Idling is fine, but choose it.`,
      })
    }
  }

  return lines
}
