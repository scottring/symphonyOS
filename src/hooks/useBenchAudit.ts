import { useCallback, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface BenchAuditResult {
  id: string
  verdict: 'ready' | 'rephrase' | 'month' | 'goal'
  suggestion?: string
  /** For month/goal verdicts: the season-grain rewrite (the upgrade path). */
  seasonVersion?: string
  reason: string
}

type CacheEntry = BenchAuditResult & {
  /** The exact title the verdict was computed for — a rename invalidates it. */
  title: string
}

// Verdicts persist across navigation (and reloads) so the audit never
// re-bills for unchanged items. A verdict is a pure function of the title,
// so the title is the cache validity check. Per-device is fine: the audit is
// a working-session tool, not synced state.
const CACHE_KEY = 'symphony.benchAudit.v1'
const CACHE_MAX = 200

function loadCache(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) as Record<string, CacheEntry> : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function persistCache(cache: Record<string, CacheEntry>) {
  try {
    const entries = Object.entries(cache).slice(-CACHE_MAX)
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // Quota/serialization failures degrade to in-memory only.
  }
}

/**
 * On-demand bench audit with a persistent per-item cache. `audit()` sends
 * ONLY items without a valid cached verdict (new or renamed); `reauditAll()`
 * forces a fresh pass. Verdict application stays tap-to-write on the caller.
 */
export function useBenchAudit(items: readonly { id: string; title: string }[]) {
  const [cache, setCache] = useState<Record<string, CacheEntry>>(loadCache)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Valid cached verdicts for the CURRENT items (title must still match). */
  const results = useMemo(() => {
    const m = new Map<string, BenchAuditResult>()
    for (const it of items) {
      const e = cache[it.id]
      if (e && e.title === it.title) m.set(it.id, e)
    }
    return m.size > 0 ? m : null
  }, [items, cache])

  const uncached = useMemo(
    () => items.filter((it) => cache[it.id]?.title !== it.title),
    [items, cache],
  )

  const run = useCallback(async (targets: readonly { id: string; title: string }[]) => {
    if (targets.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('sharpen-goal', {
        body: { mode: 'audit', items: targets },
      })
      if (fnError) throw fnError
      const list = (data as { results?: BenchAuditResult[] } | null)?.results
      if (!Array.isArray(list)) throw new Error('no results')
      const titleById = new Map(targets.map((t) => [t.id, t.title]))
      setCache((prev) => {
        const next = { ...prev }
        for (const r of list) {
          const title = titleById.get(r.id)
          if (title) next[r.id] = { ...r, title }
        }
        persistCache(next)
        return next
      })
    } catch {
      setError("The audit didn't come back — try again in a moment.")
    } finally {
      setLoading(false)
    }
  }, [])

  /** Audit only what has no valid verdict yet (new or renamed items). */
  const audit = useCallback(() => run(uncached), [run, uncached])
  /** Force a fresh pass over everything. */
  const reauditAll = useCallback(() => run(items), [run, items])

  return { audit, reauditAll, results, uncachedCount: uncached.length, loading, error }
}
