import { describe, it, expect } from 'vitest'
import { planEvent, addLogEntry, deleteLogEntry, listGoalLog } from './logDb'

type Call = { table: string; ops: Array<[string, unknown[]]> }
type Result = { data?: unknown; error?: unknown }

function fake(queues: Record<string, Result[]> = {}) {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] }
      calls.push(call)
      const chain: Record<string, unknown> = {}
      const resolve = () => {
        const r = queues[table]?.shift() ?? { data: null, error: null }
        return { data: r.data ?? null, error: r.error ?? null }
      }
      for (const m of ['insert', 'update', 'delete', 'eq', 'in', 'select', 'single', 'order', 'is', 'not']) {
        chain[m] = (...args: unknown[]) => { call.ops.push([m, args]); return chain }
      }
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(resolve()).then(res, rej)
      return chain
    },
  }
  return { client: client as never, calls }
}
const op = (c: Call, name: string) => c.ops.find((o) => o[0] === name)?.[1]

describe('planEvent', () => {
  it('writes goal_id for a year goal, with the time', async () => {
    const { client, calls } = fake({ tasks: [{ data: { id: 't9' } }] })
    const id = await planEvent(client, 'u1', {
      goal: { kind: 'goal', id: 'y1' }, goalContext: 'family', goalScope: 'household',
      optionId: 'o1', optionName: 'Scher', contactId: 'k1', kind: 'visit', on: '2026-10-30', time: '10:00', summary: 'Walk through',
    })
    expect(id).toBe('t9')
    const row = op(calls[0], 'insert')![0] as Record<string, unknown>
    expect(row.goal_id).toBe('y1')
    expect('goal_task_id' in row).toBe(false)
    expect(row.log_kind).toBe('visit')
    expect(row.is_all_day).toBe(false)
    expect(row.title).toBe('Home visit: Walk through (Scher)')
    expect(row.bucket).toBe('timed')
    expect(row.scope).toBe('household')
    expect(row.choice_option_id).toBe('o1')
    expect(row.scheduled_for).toBe(new Date(2026, 9, 30, 10, 0).toISOString())
  })
  it('is all day without a time', async () => {
    const { client, calls } = fake({ tasks: [{ data: { id: 't9' } }] })
    await planEvent(client, 'u1', {
      goal: { kind: 'task', id: 'g1' }, goalContext: null, goalScope: '', kind: 'call', on: '2026-10-30', summary: 'Ask',
    })
    const row = op(calls[0], 'insert')![0] as Record<string, unknown>
    expect(row.is_all_day).toBe(true)
    expect(row.goal_task_id).toBe('g1')
    expect(row.scope).toBe('individual')
    expect(row.title).toBe('Phone call: Ask')
    expect(row.scheduled_for).toBe(new Date(2026, 9, 30).toISOString())
  })
})

describe('addLogEntry', () => {
  it('writes goal_task_id and choice_option_id, maps the row back', async () => {
    const dbRow = {
      id: 'e1', user_id: 'u1', goal_task_id: 'g1', goal_id: null, choice_option_id: 'o1', kind: 'call',
      happened_on: '2026-10-22', happened_at_time: '14:30:00', summary: 'Hi', created_at: '2026-10-22T20:00:00Z',
    }
    const { client, calls } = fake({ goal_log_entries: [{ data: dbRow }] })
    const e = await addLogEntry(client, 'u1', {
      goal: { kind: 'task', id: 'g1' }, optionId: 'o1', kind: 'call', on: '2026-10-22', time: '14:30', summary: 'Hi',
    })
    const row = op(calls[0], 'insert')![0] as Record<string, unknown>
    expect(row.goal_task_id).toBe('g1')
    expect(row.choice_option_id).toBe('o1')
    expect(row.happened_at_time).toBe('14:30')
    expect(e?.time).toBe('14:30')
    expect(e?.goal).toEqual({ kind: 'task', id: 'g1' })
  })
})

describe('deleteLogEntry', () => {
  it('is true only when a row came back', async () => {
    expect(await deleteLogEntry(fake({ goal_log_entries: [{ data: [{ id: 'e1' }] }] }).client, 'e1')).toBe(true)
    expect(await deleteLogEntry(fake({ goal_log_entries: [{ data: [] }] }).client, 'e1')).toBe(false)
  })
})

describe('listGoalLog', () => {
  it('returns null on error and filters tasks by log_kind', async () => {
    const bad = fake({ goal_log_entries: [{ error: { message: 'x' } }] })
    expect(await listGoalLog(bad.client, { kind: 'goal', id: 'y1' })).toBeNull()
    const ok = fake()
    expect(await listGoalLog(ok.client, { kind: 'goal', id: 'y1' })).toEqual({ entries: [], planned: [] })
    expect(op(ok.calls[1], 'eq')).toEqual(['goal_id', 'y1'])
    expect(op(ok.calls[1], 'not')).toEqual(['log_kind', 'is', null])
  })
})
