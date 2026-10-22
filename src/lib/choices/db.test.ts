import { describe, it, expect } from 'vitest'
import {
  listChoicesForGoal, listOpenChoices, updateOption, createFollowUp, deleteFollowUp, chooseOption, reopenChoice, parseCell, loadChoice, createChoice, updateChoice,
  type ChoiceDetail,
} from './db'
import type { Choice, ChoiceOption, PriceLine } from '@/types/choice'

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
      for (const m of ['insert', 'update', 'delete', 'eq', 'in', 'select', 'single', 'order', 'is']) {
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

const choice: Choice = {
  id: 'c1', userId: 'u1', goal: { kind: 'task', id: 'g1' }, title: 'Contractor', status: 'open',
  decidedWork: [], columns: [], work: [{ id: 'w1', label: 'Roof' }, { id: 'w2', label: 'Siding' }],
  selectedWork: ['w1', 'w2'], sortOrder: 0, createdAt: new Date(0), updatedAt: new Date(0),
}
const option: ChoiceOption = {
  id: 'o1', choiceId: 'c1', userId: 'u1', name: 'Acme', contactId: 'k1', status: 'contacted',
  statusChangedAt: new Date(0), values: {}, sortOrder: 0, updatedAt: new Date(0),
}
const lines: PriceLine[] = [
  { id: 'l1', optionId: 'o1', workIds: ['w1'], amountCents: 100000, sortOrder: 0 },
  { id: 'l2', optionId: 'o1', workIds: ['w2'], amountCents: 50000, sortOrder: 1 },
  { id: 'l3', optionId: 'o2', workIds: ['w1', 'w2'], amountCents: 1, sortOrder: 0 },
]
const detail: ChoiceDetail = {
  choice, goalTitle: 'House', goalContext: 'family', goalScope: 'household', options: [option], lines,
  followUps: [], contacts: new Map(),
}

describe('updateOption', () => {
  it('stamps status_changed_at when status is in the patch', async () => {
    const { client, calls } = fake()
    expect(await updateOption(client, 'o1', { status: 'heard_back' })).toBe(true)
    const p = op(calls[0], 'update')![0] as Record<string, unknown>
    expect(p.status).toBe('heard_back')
    expect(typeof p.status_changed_at).toBe('string')
    expect(Number.isNaN(Date.parse(p.status_changed_at as string))).toBe(false)
    expect(op(calls[0], 'eq')).toEqual(['id', 'o1'])
  })
  it('does not stamp without status', async () => {
    const { client, calls } = fake()
    await updateOption(client, 'o1', { notes: 'x' })
    expect(op(calls[0], 'update')![0]).toEqual({ notes: 'x' })
  })
  it('returns false on error', async () => {
    const { client } = fake({ choice_options: [{ error: { message: 'no' } }] })
    expect(await updateOption(client, 'o1', { notes: 'x' })).toBe(false)
  })
})

describe('createFollowUp', () => {
  it('inserts one waiting task for a task goal', async () => {
    const { client, calls } = fake({ tasks: [{ data: { id: 't1' } }] })
    const now = Date.now()
    const id = await createFollowUp(client, 'u1', detail, option, new Date(2026, 10, 5, 15, 30))
    expect(id).toBe('t1')
    expect(calls).toHaveLength(1)
    expect(calls[0].table).toBe('tasks')
    const p = op(calls[0], 'insert')![0] as Record<string, unknown>
    const since = p.waiting_since as string
    expect(Math.abs(Date.parse(since) - now)).toBeLessThan(5000)
    expect(p).toEqual({
      title: 'Follow up with Acme', user_id: 'u1', scheduled_for: new Date(2026, 10, 5).toISOString(),
      is_all_day: true, bucket: 'timed', is_waiting: true, waiting_since: since, waiting_for: 'Acme',
      contact_id: 'k1', choice_option_id: 'o1', context: 'family', scope: 'household', goal_task_id: 'g1',
    })
  })
  it('uses goal_id for a year goal and null contact', async () => {
    const { client, calls } = fake({ tasks: [{ data: { id: 't2' } }] })
    const d = { ...detail, choice: { ...choice, goal: { kind: 'goal' as const, id: 'y1' } } }
    await createFollowUp(client, 'u1', d, { ...option, contactId: undefined }, new Date(2026, 0, 2))
    const p = op(calls[0], 'insert')![0] as Record<string, unknown>
    expect(p.goal_id).toBe('y1')
    expect('goal_task_id' in p).toBe(false)
    expect(p.contact_id).toBeNull()
  })
  it('falls back to individual scope when scope is empty', async () => {
    const { client, calls } = fake({ tasks: [{ data: { id: 't3' } }] })
    await createFollowUp(client, 'u1', { ...detail, goalScope: '' }, option, new Date())
    expect((op(calls[0], 'insert')![0] as Record<string, unknown>).scope).toBe('individual')
  })
  it('returns null on error', async () => {
    const { client } = fake({ tasks: [{ error: { message: 'x' } }] })
    expect(await createFollowUp(client, 'u1', detail, option, new Date())).toBeNull()
  })
})

describe('chooseOption', () => {
  it('chooses the option then decides the choice with the option price', async () => {
    const { client, calls } = fake()
    const now = new Date('2026-10-22T10:00:00Z')
    expect(await chooseOption(client, detail, 'o1', 'best fit', now)).toBe(true)
    expect(calls.map((c) => c.table)).toEqual(['choice_options', 'choices'])
    expect(op(calls[0], 'update')![0]).toEqual({ status: 'chosen', status_changed_at: now.toISOString() })
    expect(op(calls[1], 'update')![0]).toEqual({
      status: 'decided', chosen_option_id: 'o1', decided_at: now.toISOString(), decided_note: 'best fit',
      decided_work: ['w1', 'w2'], decided_amount_cents: 150000,
    })
  })
  it('puts the previous status back when the second write fails', async () => {
    const { client, calls } = fake({ choices: [{ error: { message: 'x' } }] })
    expect(await chooseOption(client, detail, 'o1', null, new Date())).toBe(false)
    expect(calls).toHaveLength(3)
    expect(calls[2].table).toBe('choice_options')
    expect((op(calls[2], 'update')![0] as Record<string, unknown>).status).toBe('contacted')
  })
  it('stores null amount when no price covers the work', async () => {
    const { client, calls } = fake()
    await chooseOption(client, { ...detail, lines: [] }, 'o1', null, new Date())
    expect((op(calls[1], 'update')![0] as Record<string, unknown>).decided_amount_cents).toBeNull()
  })
})

describe('reopenChoice', () => {
  it('sets chosen option to heard_back and clears decided fields', async () => {
    const { client, calls } = fake()
    const d = { ...detail, choice: { ...choice, status: 'decided' as const, chosenOptionId: 'o1' } }
    expect(await reopenChoice(client, d)).toBe(true)
    expect((op(calls[0], 'update')![0] as Record<string, unknown>).status).toBe('heard_back')
    expect(op(calls[1], 'update')![0]).toEqual({
      status: 'open', chosen_option_id: null, decided_at: null, decided_note: null, decided_work: [],
      decided_amount_cents: null,
    })
  })
})

describe('parseCell', () => {
  it('money', () => {
    expect(parseCell('money', '$19,750')).toBe(1975000)
    expect(parseCell('money', '18400.50')).toBe(1840050)
    expect(parseCell('money', '19.5k')).toBeUndefined()
  })
  it('yesno', () => {
    expect(parseCell('yesno', 'yes')).toBe(true)
    for (const s of ['no', 'false', 'n']) expect(parseCell('yesno', s)).toBe(false)
    expect(parseCell('yesno', 'maybe')).toBeUndefined()
  })
  it('date', () => {
    expect(parseCell('date', '2026-12-01')).toBe('2026-12-01')
    expect(parseCell('date', 'Dec 1')).toBeUndefined()
    expect(parseCell('date', '2026-13-45')).toBeUndefined()
  })
  it('text and blank', () => {
    expect(parseCell('text', ' hi ')).toBe('hi')
    expect(parseCell('money', '  ')).toBeNull()
  })
})

describe('loadChoice', () => {
  it('reads goal title from tasks and follow-ups by option ids', async () => {
    const row = {
      id: 'c1', user_id: 'u1', goal_task_id: 'g1', goal_id: null, title: 'T', status: 'open', chosen_option_id: null,
      decided_at: null, decided_note: null, decided_work: [], decided_amount_cents: null, columns: [], work: [],
      selected_work: [], sort_order: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    }
    const orow = {
      id: 'o1', choice_id: 'c1', user_id: 'u1', name: 'Acme', contact_id: 'k1', status: 'contacted',
      status_changed_at: '2026-01-01T00:00:00Z', values: {}, notes: null, sort_order: 0,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    }
    const { client, calls } = fake({
      choices: [{ data: row }],
      tasks: [
        { data: { title: 'House', context: 'family', scope: 'household' } },
        { data: [{ id: 't1', choice_option_id: 'o1', title: 'Follow up with Acme', scheduled_for: '2026-11-05T05:00:00Z', completed: false, waiting_since: '2026-10-22T00:00:00Z' }] },
      ],
      choice_options: [{ data: [orow] }],
      choice_price_lines: [{ data: [] }],
      contacts: [{ data: [{ id: 'k1', name: 'Acme Co', phone: '555' }] }],
    })
    const d = await loadChoice(client, 'c1')
    expect(d?.goalTitle).toBe('House')
    expect(d?.goalScope).toBe('household')
    expect(d?.followUps[0]).toMatchObject({ taskId: 't1', optionId: 'o1', completed: false })
    expect(d?.followUps[0].waitingSince).toEqual(new Date('2026-10-22T00:00:00Z'))
    expect(d?.contacts.get('k1')).toEqual({ name: 'Acme Co', phone: '555' })
    const t = calls.filter((c) => c.table === 'tasks')[1]
    expect(op(t, 'in')).toEqual(['choice_option_id', ['o1']])
  })
  const crow = {
    id: 'c1', user_id: 'u1', goal_task_id: 'g1', goal_id: null, title: 'T', status: 'open', chosen_option_id: null,
    decided_at: null, decided_note: null, decided_work: [], decided_amount_cents: null, columns: [], work: [],
    selected_work: [], sort_order: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  }
  const orow2 = {
    id: 'o1', choice_id: 'c1', user_id: 'u1', name: 'Acme', contact_id: null, status: 'contacted',
    status_changed_at: '2026-01-01T00:00:00Z', values: {}, notes: null, sort_order: 0,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  }
  it('returns null when the lines read fails', async () => {
    const { client } = fake({
      choices: [{ data: crow }], tasks: [{ data: { title: 'H', context: null, scope: null } }],
      choice_options: [{ data: [orow2] }], choice_price_lines: [{ error: { message: 'x' } }],
    })
    expect(await loadChoice(client, 'c1')).toBeNull()
  })
  it('returns null when the options read fails', async () => {
    const { client } = fake({
      choices: [{ data: crow }], tasks: [{ data: { title: 'H', context: null, scope: null } }],
      choice_options: [{ error: { message: 'x' } }],
    })
    expect(await loadChoice(client, 'c1')).toBeNull()
  })
  it('defaults a missing goal scope to individual', async () => {
    const { client } = fake({
      choices: [{ data: crow }], tasks: [{ data: { title: 'H', context: null, scope: null } }],
      choice_options: [{ data: [] }],
    })
    expect((await loadChoice(client, 'c1'))?.goalScope).toBe('individual')
  })
  it('list functions signal failure with null, not []', async () => {
    const a = fake({ choices: [{ data: [crow] }], choice_options: [{ error: { message: 'x' } }] })
    expect(await listChoicesForGoal(a.client, { kind: 'task', id: 'g1' })).toBeNull()
    const b = fake({ choices: [{ data: [crow] }], choice_options: [{ data: [orow2] }], tasks: [{ error: { message: 'x' } }] })
    expect(await listOpenChoices(b.client)).toBeNull()
    const c = fake({ choices: [{ data: [] }] })
    expect(await listOpenChoices(c.client)).toEqual([])
  })
  it('returns null when the choice is missing', async () => {
    const { client } = fake({ choices: [{ error: { message: 'none' } }] })
    expect(await loadChoice(client, 'x')).toBeNull()
  })
})

describe('createChoice / updateChoice', () => {
  it('inserts with the right goal key', async () => {
    const { client, calls } = fake({ choices: [{ data: null, error: { message: 'x' } }] })
    expect(await createChoice(client, 'u1', { kind: 'goal', id: 'y1' }, 'T')).toBeNull()
    expect(op(calls[0], 'insert')![0]).toEqual({ user_id: 'u1', goal_id: 'y1', title: 'T' })
  })
  it('updates by id', async () => {
    const { client, calls } = fake()
    expect(await updateChoice(client, 'c1', { title: 'N' })).toBe(true)
    expect(op(calls[0], 'update')![0]).toEqual({ title: 'N' })
  })
})

describe('deleteFollowUp', () => {
  it('counts a returned row as deleted', async () => {
    const { client, calls } = fake({ tasks: [{ data: [{ id: 't1' }] }] })
    expect(await deleteFollowUp(client, 't1')).toBe(true)
    expect(op(calls[0], 'eq')).toEqual(['id', 't1'])
    expect(op(calls[0], 'select')).toEqual(['id'])
  })

  it('treats zero rows (an RLS-forbidden delete) as a failure', async () => {
    const { client } = fake({ tasks: [{ data: [] }] })
    expect(await deleteFollowUp(client, 't1')).toBe(false)
  })

  it('treats an error as a failure', async () => {
    const { client } = fake({ tasks: [{ error: { message: 'no' } }] })
    expect(await deleteFollowUp(client, 't1')).toBe(false)
  })
})
