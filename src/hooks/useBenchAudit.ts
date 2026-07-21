import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface BenchAuditResult {
  id: string
  verdict: 'ready' | 'rephrase' | 'month' | 'goal'
  suggestion?: string
  reason: string
}

/**
 * On-demand bench audit — sends the bench items to the sharpen-goal edge
 * function (mode:'audit') and returns per-item season-grain verdicts. Runs
 * only when the user taps "Audit the bench" (never on render); the caller
 * renders the verdicts inline and every application of a verdict is a
 * separate user tap (AI proposes; only the user's tap writes).
 */
export function useBenchAudit() {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Map<string, BenchAuditResult> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const audit = useCallback(async (items: { id: string; title: string }[]) => {
    if (items.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('sharpen-goal', {
        body: { mode: 'audit', items },
      })
      if (fnError) throw fnError
      const list = (data as { results?: BenchAuditResult[] } | null)?.results
      if (!Array.isArray(list)) throw new Error('no results')
      setResults(new Map(list.map((r) => [r.id, r])))
    } catch {
      setError("The audit didn't come back — try again in a moment.")
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = useCallback(() => { setResults(null); setError(null) }, [])

  return { audit, results, loading, error, clear }
}
