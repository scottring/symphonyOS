import { useState, useEffect, useCallback } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { localYmd, parseLocalYmd } from '@/lib/cadence/config'
import { scopeForDomain } from '@/lib/scope'
import type { Span, SpanInput } from '@/types/span'
import type { TaskContext } from '@/types/task'

interface DbSpan {
  id: string
  user_id: string
  name: string
  start_date: string
  end_date: string
  context: TaskContext | null
  scope: Span['scope']
  created_at: string
  updated_at: string
}

/**
 * `date` columns are calendar days, so they must be read and written in LOCAL
 * time. `new Date('2026-09-05')` parses as UTC midnight, which is Sep 4
 * anywhere west of Greenwich — a long weekend that starts a day early.
 */
function fromDb(r: DbSpan): Span {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    startDate: parseLocalYmd(r.start_date),
    endDate: parseLocalYmd(r.end_date),
    context: r.context,
    scope: r.scope,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  }
}

/**
 * The household's spans — planning containers with explicit start and end
 * dates (a long weekend, a school break).
 *
 * Reads are RLS-scoped like everything else: a span is visible to the
 * household only when its scope says so, and scope is DERIVED from the
 * context, never chosen.
 */
export function useSpans() {
  const [spans, setSpans] = useState<Span[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: { user } } = await getAuthUser()
    if (!user) { setSpans([]); setLoading(false); return }
    const { data, error } = await supabase
      .from('spans').select('*').order('start_date', { ascending: true })
    if (error) { console.error('[useSpans] load failed', error); setLoading(false); return }
    setSpans((data ?? []).map((r) => fromDb(r as DbSpan)))
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const createSpan = useCallback(async (input: SpanInput): Promise<Span | null> => {
    const { data: { user } } = await getAuthUser()
    if (!user) return null
    const context = input.context ?? null
    const { data, error } = await supabase
      .from('spans')
      .insert({
        user_id: user.id,
        name: input.name.trim(),
        start_date: localYmd(input.startDate),
        end_date: localYmd(input.endDate),
        context,
        // RLS reads scope and nothing else. A family span left at the
        // 'individual' default would be invisible to the rest of the
        // household while the tasks inside it were not — an empty pool with
        // work in it.
        scope: scopeForDomain(context, [], null),
      })
      .select().single()
    if (error) { console.error('[useSpans] create failed', error); return null }
    const span = fromDb(data as DbSpan)
    setSpans((prev) => [...prev, span].sort((a, b) => a.startDate.getTime() - b.startDate.getTime()))
    return span
  }, [])

  const updateSpan = useCallback(async (id: string, updates: Partial<SpanInput>) => {
    const patch: Record<string, unknown> = {}
    if (updates.name !== undefined) patch.name = updates.name.trim()
    if (updates.startDate !== undefined) patch.start_date = localYmd(updates.startDate)
    if (updates.endDate !== undefined) patch.end_date = localYmd(updates.endDate)
    if (updates.context !== undefined) {
      patch.context = updates.context ?? null
      patch.scope = scopeForDomain(updates.context ?? null, [], null)
    }
    if (Object.keys(patch).length === 0) return
    patch.updated_at = new Date().toISOString()
    const { error } = await supabase.from('spans').update(patch).eq('id', id)
    if (error) { console.error('[useSpans] update failed', error); return }
    setSpans((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates, updatedAt: new Date() } as Span : s))
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime()))
  }, [])

  /**
   * Deleting a span never deletes the work planned into it — `span_id` is
   * ON DELETE SET NULL, and the rows are put back in the inbox so they are
   * somewhere a person will look rather than stranded in a bucket whose
   * container is gone.
   */
  const deleteSpan = useCallback(async (id: string) => {
    const { error: releaseError } = await supabase
      .from('tasks').update({ bucket: 'inbox', span_id: null }).eq('span_id', id).eq('completed', false)
    if (releaseError) { console.error('[useSpans] releasing tasks failed', releaseError); return }
    const { error } = await supabase.from('spans').delete().eq('id', id)
    if (error) { console.error('[useSpans] delete failed', error); return }
    setSpans((prev) => prev.filter((s) => s.id !== id))
  }, [])

  return { spans, loading, createSpan, updateSpan, deleteSpan, reload: load }
}
