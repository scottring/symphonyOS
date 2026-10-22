import { describe, it, expect } from 'vitest'
import { listInProgressGoals } from './inProgress'

type Result = { data?: unknown; error?: unknown }

/** A chainable stand-in for the client: each table answers from its queue. */
function fake(queues: Record<string, Result[]>) {
  const tables: string[] = []
  const client = {
    from(table: string) {
      tables.push(table)
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'order']) chain[m] = () => chain
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
        const r = queues[table]?.shift() ?? { data: null, error: null }
        return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }).then(res, rej)
      }
      return chain
    },
  }
  return { client: client as never, tables }
}

describe('listInProgressGoals', () => {
  it('groups open choices under their live goals, both goal kinds', async () => {
    const { client } = fake({
      choices: [{ data: [
        { id: 'c1', title: 'Contractor', goal_task_id: 'g1', goal_id: null },
        { id: 'c2', title: 'Tile', goal_task_id: 'g1', goal_id: null },
        { id: 'c3', title: 'Car', goal_task_id: null, goal_id: 'y1' },
      ] }],
      tasks: [{ data: [{ id: 'g1', title: 'Renovate Upstairs Bathroom', context: 'family', completed: false }] }],
      goals: [{ data: [{ id: 'y1', name: 'Replace the car', context: 'personal', status: 'active' }] }],
    })
    expect(await listInProgressGoals(client)).toEqual([
      { goal: { kind: 'task', id: 'g1' }, title: 'Renovate Upstairs Bathroom', context: 'family',
        choices: [{ id: 'c1', title: 'Contractor' }, { id: 'c2', title: 'Tile' }] },
      { goal: { kind: 'goal', id: 'y1' }, title: 'Replace the car', context: 'personal', choices: [{ id: 'c3', title: 'Car' }] },
    ])
  })

  it('leaves out a finished goal and a year goal that is not active', async () => {
    const { client } = fake({
      choices: [{ data: [
        { id: 'c1', title: 'Contractor', goal_task_id: 'g1', goal_id: null },
        { id: 'c3', title: 'Car', goal_task_id: null, goal_id: 'y1' },
      ] }],
      tasks: [{ data: [{ id: 'g1', title: 'Done goal', context: 'family', completed: true }] }],
      goals: [{ data: [{ id: 'y1', name: 'Old', context: null, status: 'archived' }] }],
    })
    expect(await listInProgressGoals(client)).toEqual([])
  })

  it('reads nothing else when no choice is open, and null when a read fails', async () => {
    const none = fake({ choices: [{ data: [] }] })
    expect(await listInProgressGoals(none.client)).toEqual([])
    expect(none.tables).toEqual(['choices'])
    const broken = fake({ choices: [{ data: [{ id: 'c1', title: 'C', goal_task_id: 'g1', goal_id: null }] }], tasks: [{ error: { message: 'x' } }] })
    expect(await listInProgressGoals(broken.client)).toBeNull()
  })
})
