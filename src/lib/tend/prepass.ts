//
// Deterministic tending — duplicate titles and stale items become proposals
// with no AI involved, so Tend degrades gracefully when the edge fn fails.

import type { Task } from '@/types/task'
import type { TendMerge, TendProposal, TendPutAside } from './types'

const STALE_DAYS = 21
const SIMILARITY_THRESHOLD = 0.85

// A real week list is mostly months old, so "everything past 21 days" is not a
// finding — it's the whole list restated as identical cards, which buries the
// merge/place cards that carry actual judgment. Surface the worst offenders
// only. The AI pass holds itself to 8 proposals; the deterministic pass gets a
// smaller share of the same attention budget.
export const MAX_PUT_ASIDE = 5

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `
  const out = new Set<string>()
  for (let i = 0; i <= padded.length - 3; i++) out.add(padded.slice(i, i + 3))
  return out
}

/** Dice coefficient over character trigrams of the normalized titles: 0..1. */
export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  if (na === nb) return 1
  const ta = trigrams(na)
  const tb = trigrams(nb)
  if (ta.size === 0 || tb.size === 0) return 0
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  return (2 * shared) / (ta.size + tb.size)
}

export function runPrepass(pool: Task[], carryOver: Task[], now: Date = new Date()): TendProposal[] {
  // Union by id (a task can be in both lists), open tasks only.
  const byId = new Map<string, Task>()
  for (const t of [...pool, ...carryOver]) {
    if (!t.completed) byId.set(t.id, t)
  }
  const tasks = [...byId.values()]

  // ── Duplicates: greedy grouping by similarity; keep the oldest. ──
  const merges: TendMerge[] = []
  const consumed = new Set<string>()
  for (let i = 0; i < tasks.length; i++) {
    if (consumed.has(tasks[i].id)) continue
    const group = [tasks[i]]
    for (let j = i + 1; j < tasks.length; j++) {
      if (consumed.has(tasks[j].id)) continue
      if (titleSimilarity(tasks[i].title, tasks[j].title) >= SIMILARITY_THRESHOLD) {
        group.push(tasks[j])
      }
    }
    if (group.length > 1) {
      group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      const [keep, ...drops] = group
      for (const t of group) consumed.add(t.id)
      merges.push({
        kind: 'merge',
        id: `prepass-merge-${keep.id}`,
        keepId: keep.id,
        dropIds: drops.map((t) => t.id),
        why: 'Same task captured more than once — keeps the older one.',
      })
    }
  }

  // ── Stale: unfinished for ≥21 days (we don't store carry history; age
  // while unfinished is the proxy — see spec). Merge drops are excluded.
  // Oldest first, then capped: if the list can only stand a few of these, they
  // should be the ones that have sat longest. ──
  const dropIds = new Set(merges.flatMap((m) => m.dropIds))
  const cutoff = now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000
  const stale: TendPutAside[] = tasks
    .filter((t) => !dropIds.has(t.id) && new Date(t.createdAt).getTime() <= cutoff)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, MAX_PUT_ASIDE)
    .map((t) => {
      const weeks = Math.floor((now.getTime() - new Date(t.createdAt).getTime()) / (7 * 24 * 60 * 60 * 1000))
      return {
        kind: 'put_aside' as const,
        id: `prepass-stale-${t.id}`,
        taskId: t.id,
        why: `Sitting unfinished for ${weeks} weeks — park it on Someday?`,
      }
    })

  return [...merges, ...stale]
}
