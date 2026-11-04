// symphony_list_tasks's read. Let go ("not ever", Scott 2026-11-04) takes an
// item off every list, so a let-go row (dismissed_at set) is left out unless
// the agent is searching by title — search is where a let-go item is found,
// as in the app.

/** The query-builder calls this read makes (supabase-js's builder has them). */
export interface TaskQuery {
  select(cols: string): TaskQuery
  order(col: string, o: { ascending: boolean; nullsFirst: boolean }): TaskQuery
  eq(col: string, v: unknown): TaskQuery
  is(col: string, v: null): TaskQuery
  ilike(col: string, v: string): TaskQuery
  gte(col: string, v: string): TaskQuery
  lte(col: string, v: string): TaskQuery
  limit(n: number): TaskQuery
}

export interface ListTasksInput {
  bucket?: string
  context?: string
  completed?: boolean
  is_waiting?: boolean
  search?: string
  scheduled_for?: string
  limit?: number
}

export function listTasksQuery(db: { from: (t: string) => unknown }, input: ListTasksInput): PromiseLike<{ data: unknown[] | null; error: unknown }> {
  let q = (db.from('tasks') as { select(cols: string): TaskQuery }).select('*').order('scheduled_for', { ascending: true, nullsFirst: false })
  if (input.bucket) q = q.eq('bucket', input.bucket)
  if (input.context) q = q.eq('context', input.context)
  if (input.completed !== undefined) q = q.eq('completed', input.completed)
  if (input.is_waiting !== undefined) q = q.eq('is_waiting', input.is_waiting)
  if (input.search) q = q.ilike('title', `%${input.search}%`)
  else q = q.is('dismissed_at', null)
  if (input.scheduled_for) {
    q = q.gte('scheduled_for', `${input.scheduled_for}T00:00:00`).lte('scheduled_for', `${input.scheduled_for}T23:59:59`)
  }
  return q.limit(typeof input.limit === 'number' ? input.limit : 50) as unknown as PromiseLike<{ data: unknown[] | null; error: unknown }>
}
