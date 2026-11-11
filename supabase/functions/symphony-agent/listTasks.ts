import { localDayBounds } from './schedule.ts'
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
  lt(col: string, v: string): TaskQuery
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
  /** 'list': the order the Week list and Today's sheet show (sort_order, nulls last). */
  order_by?: string
}

/** The stated cap: the model's limit is clamped to 1..50. */
export const LIST_TASKS_MAX = 50

export function listTasksQuery(db: { from: (t: string) => unknown }, input: ListTasksInput): PromiseLike<{ data: unknown[] | null; error: unknown }> {
  let q = (db.from('tasks') as { select(cols: string): TaskQuery }).select('*')
    .order(input.order_by === 'list' ? 'sort_order' : 'scheduled_for', { ascending: true, nullsFirst: false })
  if (input.bucket) q = q.eq('bucket', input.bucket)
  if (input.context) q = q.eq('context', input.context)
  if (input.completed !== undefined) q = q.eq('completed', input.completed)
  if (input.is_waiting !== undefined) q = q.eq('is_waiting', input.is_waiting)
  if (input.search) q = q.ilike('title', `%${input.search}%`)
  else q = q.is('dismissed_at', null)
  if (input.scheduled_for && /^\d{4}-\d{2}-\d{2}$/.test(input.scheduled_for)) {
    // The person's day, not the UTC date: after 8pm Eastern a UTC day is tomorrow.
    const { start, end } = localDayBounds(input.scheduled_for)
    q = q.gte('scheduled_for', start).lt('scheduled_for', end)
  }
  const n = typeof input.limit === 'number' && Number.isFinite(input.limit) ? Math.floor(input.limit) : LIST_TASKS_MAX
  return q.limit(Math.min(LIST_TASKS_MAX, Math.max(1, n))) as unknown as PromiseLike<{ data: unknown[] | null; error: unknown }>
}
