import { describe, it, expect } from 'vitest'
import { assembleContext } from './assemble'

/** Chainable stub: stub({ tasks: { data: {...} }, contacts: { data: [...] } }) */
function stubClient(tables: Record<string, { data: unknown; error?: { message: string } | null }>) {
  return {
    from(table: string) {
      const result = tables[table] ?? { data: null, error: { message: `no stub for ${table}` } }
      const chain: Record<string, unknown> = {}
      const self = () => chain
      for (const m of ['select', 'eq', 'in', 'order', 'limit', 'not']) chain[m] = self
      chain.single = () => Promise.resolve(result)
      chain.maybeSingle = () => Promise.resolve(result)
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
      return chain
    },
    rpc: () => Promise.resolve(tables['__rpc__'] ?? { data: [], error: null }),
  } as never
}

const TASK = {
  id: 't1', title: 'Call Camp Notre Dame', notes: null, links: [], phone_number: null,
  contact_id: 'c1', assigned_to: null, project_id: 'p1', goal_id: 'g1',
  scheduled_for: null, bucket: 'week', is_waiting: true, waiting_since: '2026-07-22T00:00:00Z',
  defer_count: 2, location: null, created_at: '2026-07-01T00:00:00Z', completed: false,
}

describe('assembleContext (task)', () => {
  it('assembles all parts from a fully-stubbed world', async () => {
    const client = stubClient({
      tasks: { data: TASK },
      contacts: { data: [{ id: 'c1', name: 'Camp Notre Dame', phone: '410-555-0100', email: null, relationship: null, category: 'org' }] },
      projects: { data: { id: 'p1', name: 'Summer 2026', status: 'in_progress' } },
      goals: { data: { id: 'g1', title: 'Great summer' } },
      attachments: { data: [{ id: 'a1', facets: [{ type: 'phone', number: '410-555-0199' }] }] },
      note_entity_links: { data: [{ note_id: 'n1' }] },
      notes: { data: [{ id: 'n1', title: 'camp-notes', content: 'left voicemail 7/27', vault_path: null }] },
      action_history: { data: [{ action_type: 'call', detail: 'Called', outcome: 'no_answer', created_at: '2026-07-27T10:00:00Z' }] },
    })
    const b = await assembleContext({ client, now: new Date('2026-07-29T00:00:00Z') }, { entityType: 'task', entityId: 't1', userId: 'u1' })
    expect(b.entity.title).toBe('Call Camp Notre Dame')
    expect(b.people[0]).toMatchObject({ name: 'Camp Notre Dame', role: 'about', phone: '410-555-0100' })
    expect(b.lineage).toMatchObject({ projectName: 'Summer 2026', goalTitle: 'Great summer' })
    expect(b.facts[0].facet).toMatchObject({ type: 'phone', number: '410-555-0199' })
    expect(b.knowledge[0]).toMatchObject({ id: 'n1', source: 'linked' })
    expect(b.history[0]).toMatchObject({ actionType: 'call', outcome: 'no_answer' })
    expect(b.time.ageDays).toBe(28)
    expect(b.degraded).toEqual([])
  })

  it('degrades a failed part instead of throwing', async () => {
    const client = stubClient({
      tasks: { data: TASK },
      contacts: { data: null, error: { message: 'boom' } },
      projects: { data: { id: 'p1', name: 'Summer 2026', status: 'in_progress' } },
      goals: { data: { id: 'g1', title: 'Great summer' } },
      attachments: { data: [] },
      note_entity_links: { data: [] },
      notes: { data: [] },
      action_history: { data: [] },
    })
    const b = await assembleContext({ client }, { entityType: 'task', entityId: 't1', userId: 'u1' })
    expect(b.degraded).toContain('people')
    expect(b.entity.title).toBe('Call Camp Notre Dame')
  })

  it('throws only when the entity itself is missing', async () => {
    const client = stubClient({ tasks: { data: null, error: { message: 'not found' } } })
    await expect(assembleContext({ client }, { entityType: 'task', entityId: 'missing', userId: 'u1' }))
      .rejects.toThrow()
  })

  it('skips semantic knowledge when no openAiKey', async () => {
    const client = stubClient({
      tasks: { data: TASK }, contacts: { data: [] }, projects: { data: null }, goals: { data: null },
      attachments: { data: [] }, note_entity_links: { data: [] }, notes: { data: [] }, action_history: { data: [] },
    })
    const b = await assembleContext({ client }, { entityType: 'task', entityId: 't1', userId: 'u1' })
    expect(b.knowledge).toEqual([])
    expect(b.degraded).not.toContain('knowledge')  // absent key is a config choice, not a failure
  })
})
