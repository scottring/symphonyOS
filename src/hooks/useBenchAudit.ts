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

export interface AuditSlate {
  ids: string[]
  rationale: string
}

type SlateEntry = AuditSlate & {
  /** Fingerprint of the full season pool the slate was computed over. */
  fingerprint: string
}

function fingerprintOf(items: readonly { id: string; title: string }[]): string {
  return items.map((i) => `${i.id}:${i.title}`).sort().join('|')
}

const SLATE_KEY = 'symphony.benchAudit.slate.v1'

function loadSlate(): SlateEntry | null {
  try {
    const raw = localStorage.getItem(SLATE_KEY)
    return raw ? JSON.parse(raw) as SlateEntry : null
  } catch { return null }
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
export function useBenchAudit(items: readonly { id: string; title: string }[], picks: readonly { id: string; title: string }[] = []) {
  const [cache, setCache] = useState<Record<string, CacheEntry>>(loadCache)
  const [slateEntry, setSlateEntry] = useState<SlateEntry | null>(loadSlate)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const poolFingerprint = useMemo(() => fingerprintOf([...items, ...picks]), [items, picks])
  /** The slate is only valid for the exact pool it was computed over. */
  const slate = useMemo(
    () => (slateEntry && slateEntry.fingerprint === poolFingerprint ? { ids: slateEntry.ids, rationale: slateEntry.rationale } : null),
    [slateEntry, poolFingerprint],
  )

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

  const run = useCallback(async (targets: readonly { id: string; title: string }[], wantSlate: boolean) => {
    if (targets.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('sharpen-goal', {
        body: { mode: 'audit', items: targets, picks, wantSlate },
      })
      if (fnError) throw fnError
      const payload = data as { results?: BenchAuditResult[]; slate?: AuditSlate | null } | null
      const list = payload?.results
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
      // Only a full-pool run (wantSlate) can produce a slate worth trusting —
      // a partial (incremental) run judged an incomplete pool, so it must
      // never overwrite a slate cached for the full pool's fingerprint. A
      // still-valid slate for the CURRENT fingerprint simply keeps showing.
      if (wantSlate && payload?.slate && Array.isArray(payload.slate.ids) && payload.slate.ids.length > 0) {
        const entry: SlateEntry = { ids: payload.slate.ids, rationale: payload.slate.rationale ?? '', fingerprint: poolFingerprint }
        setSlateEntry(entry)
        try { localStorage.setItem(SLATE_KEY, JSON.stringify(entry)) } catch { /* in-memory only */ }
      }
    } catch {
      setError("The audit didn't come back — try again in a moment.")
    } finally {
      setLoading(false)
    }
  }, [picks, poolFingerprint])

  /** Audit only what has no valid verdict yet (new or renamed items). A
   *  first full run (nothing was cached) earns a slate; a partial run —
   *  some items already had verdicts — judged an incomplete pool and must
   *  not produce/cache a slate for the full pool's fingerprint. */
  const audit = useCallback(() => run(uncached, uncached.length === items.length), [run, uncached, items])
  /** Force a fresh pass over everything — always earns a slate. */
  const reauditAll = useCallback(() => run(items, true), [run, items])

  /** Applying an AI rewrite (rephrase's "Use…" or the goal/month upgrade's
   *  "Season-size it…") produces text the model itself already judged
   *  season-ready — write the verdict directly instead of re-billing to
   *  re-judge it. Plain manual edits skip this and fall through to the
   *  normal title-mismatch invalidation. */
  const markReady = useCallback((id: string, title: string) => {
    setCache((prev) => {
      const next = { ...prev, [id]: { id, verdict: 'ready' as const, reason: 'audit rewrite applied', title } }
      persistCache(next)
      return next
    })
  }, [])

  return { audit, reauditAll, markReady, results, slate, uncachedCount: uncached.length, loading, error }
}
