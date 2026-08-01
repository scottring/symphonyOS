import { describe, it, expect } from 'vitest'
import { assembleContext } from './assemble'

/** Chainable stub: stub({ tasks: { data: {...} }, contacts: { data: [...] } }) */
function stubClient(tables: Record<string, { data: unknown; error?: { message: string } | null }>) {
  return {
    from(table: string) {
      const result = tables[table] ?? { data: null, error: { message: `no stub for ${table}` } }
      const chain: Record<string, unknown> = {}
      const self = () => chain
      for (const m of ['select', 'eq', 'in', 'or', 'order', 'limit', 'not']) chain[m] = self
      chain.single = () => Promise.resolve(result)
      chain.maybeSingle = () => Promise.resolve(result)
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
      return chain
    },
    rpc: () => Promise.resolve(tables['__rpc__'] ?? { data: [], error: null }),
  } as never
}

/** Records the narrowing filter each table was queried with, so a test can assert whether a
 *  query mirrored the scope-gated RLS (`.or`) or the owner-only RLS (`.eq('user_id', …)`). */
function stubClientRecordingFilters(
  tables: Record<string, { data: unknown; error?: { message: string } | null }>,
  filters: { table: string; kind: 'eq' | 'or'; value: string }[]
) {
  return {
    from(table: string) {
      const result = tables[table] ?? { data: null, error: { message: `no stub for ${table}` } }
      const chain: Record<string, unknown> = {}
      const self = () => chain
      for (const m of ['select', 'in', 'order', 'limit', 'not']) chain[m] = self
      chain.eq = (col: string, val: unknown) => {
        if (col === 'user_id') filters.push({ table, kind: 'eq', value: String(val) })
        return chain
      }
      chain.or = (filter: string) => {
        filters.push({ table, kind: 'or', value: filter })
        return chain
      }
      chain.single = () => Promise.resolve(result)
      chain.maybeSingle = () => Promise.resolve(result)
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
      return chain
    },
    rpc: () => Promise.resolve(tables['__rpc__'] ?? { data: [], error: null }),
  } as never
}

/** Like stubClient, but every `.eq(col, val)` call is recorded (with its table) so a test
 *  can assert which entity_type string a query was actually filtered by. */
function stubClientRecordingEq(
  tables: Record<string, { data: unknown; error?: { message: string } | null }>,
  calls: { table: string; col: string; val: unknown }[]
) {
  return {
    from(table: string) {
      const result = tables[table] ?? { data: null, error: { message: `no stub for ${table}` } }
      const chain: Record<string, unknown> = {}
      const self = () => chain
      for (const m of ['select', 'in', 'or', 'order', 'limit', 'not']) chain[m] = self
      chain.eq = (col: string, val: unknown) => {
        calls.push({ table, col, val })
        return chain
      }
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

// The graph runs service-role, so it must restate each table's RLS itself. These tests pin
// WHICH tables widen to household-shared rows and which stay owner-only — mirroring the real
// policies, not applying the most permissive one everywhere.
describe('assembleContext (household visibility)', () => {
  const HOUSEHOLD = {
    household_members: { data: [{ household_id: 'h1' }, { user_id: 'u1' }, { user_id: 'u2' }] },
  }

  /** household_members is read twice (my households, then their members); one stub row set
   *  satisfies both because each read selects a different column. */
  function sharedWorld(extra: Record<string, { data: unknown; error?: { message: string } | null }> = {}) {
    return {
      ...HOUSEHOLD,
      tasks: { data: TASK }, contacts: { data: [] }, projects: { data: null }, goals: { data: null },
      attachments: { data: [] }, note_entity_links: { data: [] }, notes: { data: [] },
      action_history: { data: [] },
      ...extra,
    }
  }

  it('reaches a task owned by an active co-member', async () => {
    const client = stubClient(sharedWorld())
    const b = await assembleContext({ client }, { entityType: 'task', entityId: 't1', userId: 'u1' })
    expect(b.entity.title).toBe('Call Camp Notre Dame')
  })

  it('gates tasks, projects, contacts and notes on scope — never on user_id alone', async () => {
    const filters: { table: string; kind: 'eq' | 'or'; value: string }[] = []
    const client = stubClientRecordingFilters(
      sharedWorld({
        tasks: { data: { ...TASK, project_id: 'p1' } },
        contacts: { data: [] },
        projects: { data: { id: 'p1', name: 'Summer 2026', status: 'in_progress' } },
        note_entity_links: { data: [{ note_id: 'n1' }] },
      }),
      filters
    )

    await assembleContext({ client }, { entityType: 'task', entityId: 't1', userId: 'u1' })

    for (const table of ['tasks', 'projects', 'contacts', 'notes']) {
      const applied = filters.filter(f => f.table === table)
      expect(applied.length, `${table} was never narrowed`).toBeGreaterThan(0)
      for (const f of applied) {
        expect(f.kind, `${table} used a bare user_id filter instead of the scope predicate`).toBe('or')
        expect(f.value).toContain('and(scope.in.(couple,compound)')
      }
    }
  })

  it('keeps goals, attachments and action_history owner-only, matching their own RLS', async () => {
    const filters: { table: string; kind: 'eq' | 'or'; value: string }[] = []
    const client = stubClientRecordingFilters(
      sharedWorld({ tasks: { data: { ...TASK, goal_id: 'g1' } } }),
      filters
    )

    await assembleContext({ client }, { entityType: 'task', entityId: 't1', userId: 'u1' })

    for (const table of ['goals', 'attachments', 'action_history']) {
      const applied = filters.filter(f => f.table === table)
      expect(applied.length, `${table} was never narrowed`).toBeGreaterThan(0)
      for (const f of applied) {
        expect(f.kind, `${table} widened past its owner-only RLS`).toBe('eq')
        expect(f.value).toBe('u1')
      }
    }
  })

  it('keeps calendar_events owner-only — the scope axis deliberately skipped that table', async () => {
    const filters: { table: string; kind: 'eq' | 'or'; value: string }[] = []
    const client = stubClientRecordingFilters({
      ...HOUSEHOLD,
      calendar_events: { data: { id: 'e1', title: 'Team sync', description: null, location: null, start_time: '2026-07-29T10:00:00Z', created_at: '2026-07-01T00:00:00Z' } },
      contacts: { data: [] }, attachments: { data: [] },
      note_entity_links: { data: [] }, notes: { data: [] }, action_history: { data: [] },
    }, filters)

    await assembleContext({ client }, { entityType: 'calendar_event', entityId: 'e1', userId: 'u1' })

    const applied = filters.filter(f => f.table === 'calendar_events')
    expect(applied).toEqual([{ table: 'calendar_events', kind: 'eq', value: 'u1' }])
  })

  it('falls back to owner-only when household membership cannot be resolved', async () => {
    const filters: { table: string; kind: 'eq' | 'or'; value: string }[] = []
    const client = stubClientRecordingFilters({
      household_members: { data: null, error: { message: 'boom' } },
      tasks: { data: TASK }, contacts: { data: [] }, projects: { data: null }, goals: { data: null },
      attachments: { data: [] }, note_entity_links: { data: [] }, notes: { data: [] },
      action_history: { data: [] },
    }, filters)

    await assembleContext({ client }, { entityType: 'task', entityId: 't1', userId: 'u1' })

    expect(filters.filter(f => f.kind === 'or')).toEqual([])
    expect(filters.filter(f => f.table === 'tasks')).toEqual([{ table: 'tasks', kind: 'eq', value: 'u1' }])
  })

  it('honours a caller-supplied owner set without re-reading household_members', async () => {
    const filters: { table: string; kind: 'eq' | 'or'; value: string }[] = []
    const client = stubClientRecordingFilters({
      tasks: { data: TASK }, contacts: { data: [] }, projects: { data: null }, goals: { data: null },
      attachments: { data: [] }, note_entity_links: { data: [] }, notes: { data: [] },
      action_history: { data: [] },
    }, filters)

    await assembleContext(
      { client, visibleOwnerIds: ['u1', 'u2'] },
      { entityType: 'task', entityId: 't1', userId: 'u1' }
    )

    expect(filters.some(f => f.table === 'household_members')).toBe(false)
    expect(filters.find(f => f.table === 'tasks')?.kind).toBe('or')
  })
})

describe('assembleContext (calendar_event)', () => {
  const EVENT = {
    id: 'e1', title: 'Team sync', description: null, location: null,
    start_time: '2026-07-29T10:00:00Z', created_at: '2026-07-01T00:00:00Z',
  }

  it('queries note_entity_links with the legacy "event" entity_type, not "calendar_event"', async () => {
    const calls: { table: string; col: string; val: unknown }[] = []
    const client = stubClientRecordingEq({
      calendar_events: { data: EVENT },
      contacts: { data: [] },
      attachments: { data: [] },
      note_entity_links: { data: [] },
      notes: { data: [] },
      action_history: { data: [] },
    }, calls)

    await assembleContext({ client }, { entityType: 'calendar_event', entityId: 'e1', userId: 'u1' })

    const entityTypeCalls = calls.filter(c => c.table === 'note_entity_links' && c.col === 'entity_type')
    expect(entityTypeCalls).toHaveLength(1)
    expect(entityTypeCalls[0].val).toBe('event')
    expect(entityTypeCalls[0].val).not.toBe('calendar_event')
  })

  it('still returns a well-formed bundle with empty lineage', async () => {
    const client = stubClientRecordingEq({
      calendar_events: { data: EVENT },
      contacts: { data: [] },
      attachments: { data: [] },
      note_entity_links: { data: [{ note_id: 'n1' }] },
      notes: { data: [{ id: 'n1', title: 'sync notes', content: 'agenda: Q3 roadmap', vault_path: null }] },
      action_history: { data: [] },
    }, [])

    const b = await assembleContext({ client }, { entityType: 'calendar_event', entityId: 'e1', userId: 'u1' })
    expect(b.entity.title).toBe('Team sync')
    expect(b.lineage).toEqual({})
    expect(b.knowledge[0]).toMatchObject({ id: 'n1', source: 'linked' })
    expect(b.degraded).toEqual([])
  })
})
