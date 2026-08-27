// Characterization harness. Each surface's parity test replays the shared
// corpus through that surface's pipeline and records which routines survive.
// Written and run GREEN against the pre-migration code, then run again after
// the migration: a diff here is a behavior change, and it has to be named in
// the commit message rather than absorbed.
import type { Routine } from '@/types/actionable'
import type { CorpusRow } from '@/lib/routineVisibility.fixtures'

/** The corpus rows that share one ctx, so a surface can be replayed per-scenario. */
export function corpusScenarios(rows: readonly CorpusRow[]): Map<string, CorpusRow[]> {
  const byCtx = new Map<string, CorpusRow[]>()
  for (const row of rows) {
    const key = JSON.stringify({
      date: row.ctx.date.toISOString(),
      member: row.ctx.member ?? null,
      prefs: row.ctx.prefs,
      lastCompletedAt: row.ctx.lastCompletedAt?.toISOString() ?? null,
      // Which ids a deferral placed onto `date` is part of the scenario, not
      // an incidental detail — two rows that differ only here are being
      // asked different questions and must not share one representative ctx.
      deferredInto: row.ctx.deferredInto ? [...row.ctx.deferredInto].sort() : null,
    })
    const arr = byCtx.get(key) ?? []
    arr.push(row)
    byCtx.set(key, arr)
  }
  return byCtx
}

/** Sorted, deduped ids a pipeline renders. Sorting makes the diff readable. */
export function recordVisible<T>(
  routines: Routine[],
  pipeline: (input: Routine[]) => T[],
  id: (item: T) => string,
): string[] {
  return [...new Set(pipeline(routines).map(id))].sort()
}
