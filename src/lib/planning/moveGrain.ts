// src/lib/planning/moveGrain.ts
//
// Deterministic grain check for the MONTH list (no network, no model). A month
// move is one concrete chunk that ends in a result — an order placed, a call
// made, a decision written down. What actually lands in the month bucket is
// often a single sitting ("Put down sand", "Try out the umbrella"): those are
// week-sized, and five of them are really ONE month move with five steps.
//
// Two honest signals, both conservative — this only ever renders a dismissible
// hint next to a one-tap "Push to week", it never blocks or rewrites:
//   1. the title opens with a single-sitting verb and stays short, and
//   2. three or more open month items share a project — the cluster is the
//      move, the members are its steps.
// Mirrors goalQuality's `looksVague` and outcomeCoach's `looksLikeActivity`:
// err toward NOT flagging.

import type { Task } from '@/types/task'

/** Verbs that describe one sitting: an errand, a purchase, a chore, a lookup.
 *  Deliberately excludes the month-grain verbs — decide, plan, agree, model,
 *  identify, write down — which name a result rather than an action. */
const SINGLE_SITTING_OPENERS = [
  /^buy\b/i, /^order\b/i, /^pick\s+up\b/i, /^drop\s+off\b/i, /^return\b/i,
  /^call\b/i, /^text\b/i, /^email\b/i, /^look\s+up\b/i,
  /^try(\s+out)?\b/i, /^put\s+(down|up|away)\b/i, /^hang\b/i, /^label\b/i,
  /^get\s+rid\s+of\b/i, /^get\s+plants?\b/i, /^throw\s+(out|away)\b/i,
  /^weed\b/i, /^mow\b/i, /^water\b/i, /^wash\b/i, /^sweep\b/i, /^clean\b/i,
  /^fix\s+the\b/i, /^print\b/i, /^scan\b/i, /^file\b/i,
]

/** Longer than this and the line is a considered commitment, not an errand —
 *  never nag it, however small its opening verb. */
const SHORT_ENOUGH = 8

export function looksSingleSitting(title: string): boolean {
  const t = title.trim()
  if (!t) return false
  // A comma or "and" means several things in one line — that's a chunk, not a
  // sitting, and splitting it is a different conversation.
  if (/,| and /i.test(t)) return false
  if (t.split(/\s+/).length > SHORT_ENOUGH) return false
  return SINGLE_SITTING_OPENERS.some((re) => re.test(t))
}

const CLUSTER_THRESHOLD = 3

export interface MoveCluster {
  projectId: string
  taskIds: string[]
}

/** Projects with enough open month items that the PROJECT, not the item, is
 *  the month's unit. The caller renders one row per cluster with one bulk
 *  action — a per-item hint repeated N times says the same thing N times and
 *  offers the wrong grain of fix. */
export function clusterMoves(tasks: readonly Task[]): MoveCluster[] {
  const open = tasks.filter((t) => !t.completed && t.bucket === 'month')
  const byProject = new Map<string, Task[]>()
  for (const t of open) {
    if (!t.projectId) continue
    const arr = byProject.get(t.projectId) ?? []
    arr.push(t)
    byProject.set(t.projectId, arr)
  }
  const clusters: MoveCluster[] = []
  for (const [projectId, members] of byProject) {
    if (members.length < CLUSTER_THRESHOLD) continue
    clusters.push({ projectId, taskIds: members.map((t) => t.id) })
  }
  return clusters
}

/** Open month items that read week-sized → id ⇒ human reason. Empty map when
 *  the list is honestly month-grained. */
export function weekSizedMoves(tasks: readonly Task[]): Map<string, string> {
  const open = tasks.filter((t) => !t.completed && t.bucket === 'month')
  const flagged = new Map<string, string>()

  for (const cluster of clusterMoves(open)) {
    for (const id of cluster.taskIds) {
      flagged.set(id, `${cluster.taskIds.length} items on this project — together they're one month move, separately they're week steps.`)
    }
  }

  for (const t of open) {
    if (flagged.has(t.id)) continue
    if (looksSingleSitting(t.title)) {
      flagged.set(t.id, 'Reads like one sitting — that grain belongs on a week.')
    }
  }
  return flagged
}
