import { describe, it, expect } from 'vitest'
import { applyScopeVisibility, resolveVisibleOwners, SHARED_SCOPES } from './visibility'

/** Minimal query double recording whichever narrowing call was made. */
function queryDouble() {
  const calls: { method: 'eq' | 'or'; arg: unknown }[] = []
  const q = {
    calls,
    eq(column: string, value: unknown) {
      calls.push({ method: 'eq', arg: `${column}=${value}` })
      return q
    },
    or(filter: string) {
      calls.push({ method: 'or', arg: filter })
      return q
    },
  }
  return q
}

/** Stub for the two household_members reads resolveVisibleOwners makes, in order. */
function householdClient(responses: { data: unknown; error?: { message: string } | null }[]) {
  let call = 0
  return {
    from() {
      const result = responses[call++] ?? { data: [], error: null }
      const chain: Record<string, unknown> = {}
      const self = () => chain
      for (const m of ['select', 'eq', 'in']) chain[m] = self
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
      return chain
    },
  } as never
}

describe('resolveVisibleOwners', () => {
  it('returns the caller alone when they belong to no household', async () => {
    const client = householdClient([{ data: [] }])
    expect(await resolveVisibleOwners(client, 'u1')).toEqual(['u1'])
  })

  it('includes active co-members of the caller\'s households', async () => {
    const client = householdClient([
      { data: [{ household_id: 'h1' }] },
      { data: [{ user_id: 'u1' }, { user_id: 'u2' }] },
    ])
    expect((await resolveVisibleOwners(client, 'u1')).sort()).toEqual(['u1', 'u2'])
  })

  it('deduplicates the caller and repeated peers across households', async () => {
    const client = householdClient([
      { data: [{ household_id: 'h1' }, { household_id: 'h2' }, { household_id: 'h1' }] },
      { data: [{ user_id: 'u1' }, { user_id: 'u2' }, { user_id: 'u2' }] },
    ])
    expect((await resolveVisibleOwners(client, 'u1')).sort()).toEqual(['u1', 'u2'])
  })

  // Failing open here would hand one user's assistant another user's private task graph.
  it('fails CLOSED to owner-only when the membership lookup errors', async () => {
    const client = householdClient([{ data: null, error: { message: 'boom' } }])
    expect(await resolveVisibleOwners(client, 'u1')).toEqual(['u1'])
  })

  it('fails CLOSED when the peer lookup errors', async () => {
    const client = householdClient([
      { data: [{ household_id: 'h1' }] },
      { data: null, error: { message: 'boom' } },
    ])
    expect(await resolveVisibleOwners(client, 'u1')).toEqual(['u1'])
  })
})

describe('applyScopeVisibility', () => {
  it('collapses to a plain owner-only eq when there are no peers', () => {
    const q = queryDouble()
    applyScopeVisibility(q, 'u1', ['u1'])
    expect(q.calls).toEqual([{ method: 'eq', arg: 'user_id=u1' }])
  })

  it('admits own rows OR peers\' shared rows, never peers\' private rows', () => {
    const q = queryDouble()
    applyScopeVisibility(q, 'u1', ['u1', 'u2'])
    expect(q.calls).toHaveLength(1)
    const filter = q.calls[0].arg as string
    expect(q.calls[0].method).toBe('or')
    // own rows unconditionally
    expect(filter).toContain('user_id.eq.u1')
    // peer rows only through the scope gate — the two must be bound together in one and(),
    // otherwise the OR would admit every private row u2 owns.
    expect(filter).toContain('and(scope.in.(couple,compound),user_id.in.(u2))')
  })

  it('never lets a peer id appear outside the scope-gated clause', () => {
    const q = queryDouble()
    applyScopeVisibility(q, 'u1', ['u1', 'u2', 'u3'])
    const filter = q.calls[0].arg as string
    const [ownClause, ...rest] = filter.split(',and(')
    expect(ownClause).toBe('user_id.eq.u1')
    expect(rest.join(',and(')).toBe('scope.in.(couple,compound),user_id.in.(u2,u3))')
  })

  it('gates on exactly the scope values the RLS policy names', () => {
    expect([...SHARED_SCOPES]).toEqual(['couple', 'compound'])
    expect([...SHARED_SCOPES]).not.toContain('individual')
  })
})
