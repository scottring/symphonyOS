import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useRoutines, __resetSelfMemberCache } from './useRoutines'

// Scope is DERIVED from the routine's domain + its assignees (scopeForDomain
// in src/lib/scope.ts) on every routine write — never passed in.
//
// Routines share on `scope`, and ONLY on scope: the routines RLS read policy is
// `auth.uid() = user_id OR (scope IN ('couple','compound') AND
// users_share_household(...))` (2026-06-07_scope_axis.sql:44). `context` is a
// life area — no policy reads it.
//
// Every routine write built its payload by hand and never named a scope, so the
// column sat at its `NOT NULL DEFAULT 'individual'`. The 2026-06-07 migration
// backfilled the family routines that existed THEN to 'compound'; every one
// created or tagged family after it stayed private to its owner. That is why
// Iris could see some family routines and not others — 23 of them, including
// "Iris laundry and clothes processing" and the whole "Camp Mornings"
// collection, were context='family' + scope='individual' in prod.

let mockUser: { id: string; email: string } = { id: 'test-user-id', email: 'test@example.com' }

/** The household as the DB holds it. `test-user-id` matches nothing, so the
 *  self-exclusion is off for every test that doesn't switch users. */
const familyMemberRows = [
  { id: 'member-a', user_id: 'user-a', auth_user_id: null, is_full_user: false },
  { id: 'member-b', user_id: 'user-a', auth_user_id: 'user-b', is_full_user: false },
]

interface MockDbRoutine {
  id: string
  user_id: string
  name: string
  visibility: string
  paused_until: string | null
  recurrence_pattern: { type: string }
  context: string | null
  scope: string
  created_at: string
  updated_at: string
}

const mockRoutines: MockDbRoutine[] = []
/** Payload of every `.insert(...)` on `routines`. */
const inserts: Array<Record<string, unknown>> = []
/** Every `.update(...).eq('id', ...)` on `routines`. */
const rowWrites: Array<{ id: string; data: Record<string, unknown> }> = []

function dbRoutine(over: Partial<MockDbRoutine> = {}): MockDbRoutine {
  return {
    id: 'routine-x',
    user_id: 'test-user-id',
    name: 'Yard weeding',
    visibility: 'active',
    paused_until: null,
    recurrence_pattern: { type: 'weekly' },
    context: null,
    scope: 'individual',
    created_at: '2026-08-01T12:00:00Z',
    updated_at: '2026-08-01T12:00:00Z',
    ...over,
  }
}

vi.mock('@/lib/realtime/keepAlive', () => ({
  onRealtimeResumed: () => () => {},
}))

vi.mock('@/lib/supabase', () => ({
  getAuthUser: () => Promise.resolve({ data: { user: mockUser } }),
  supabase: {
    channel: vi.fn(() => {
      const ch: Record<string, unknown> = { on: vi.fn().mockReturnThis(), unsubscribe: vi.fn() }
      ch.subscribe = vi.fn(() => ch)
      return ch
    }),
    from: (table: string) => ({
      select: () => ({
        // family_members is awaited directly (no .eq/.order), so the object the
        // mock returns has to be a thenable resolving to { data }.
        then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
          resolve({ data: table === 'family_members' ? familyMemberRows : [], error: null }),
        // actionable_instances (last-completion map)
        eq: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
        // routines
        order: () => Promise.resolve({ data: table === 'routines' ? mockRoutines : [], error: null }),
      }),
      insert: (data: Record<string, unknown>) => {
        inserts.push(data)
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'new-routine', ...data }, error: null }),
          }),
        }
      },
      update: (data: Record<string, unknown>) => ({
        eq: (_field: string, value: string) => {
          rowWrites.push({ id: value, data })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

/** The write the hook actually sent for `id`. */
function writeFor(id: string): Record<string, unknown> {
  const write = rowWrites.find((w) => w.id === id)
  expect(write, `no row write for ${id}`).toBeDefined()
  return write!.data
}

async function mountLoaded() {
  const hook = renderHook(() => useRoutines())
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  return hook
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUser = { id: 'test-user-id', email: 'test@example.com' }
  __resetSelfMemberCache()
  mockRoutines.length = 0
  inserts.length = 0
  rowWrites.length = 0
})

describe('addRoutine — a created routine names who can see it', () => {
  it('shares a family routine with the household', async () => {
    const { result } = await mountLoaded()

    await act(async () => {
      await result.current.addRoutine({ name: 'Yard weeding', context: 'family' })
    })

    expect(inserts).toHaveLength(1)
    expect(inserts[0].context).toBe('family')
    expect(inserts[0].scope).toBe('compound')
  })

  it('keeps a personal routine private', async () => {
    const { result } = await mountLoaded()

    await act(async () => {
      await result.current.addRoutine({ name: 'PT exercises', context: 'personal' })
    })

    expect(inserts[0].scope).toBe('individual')
  })

  it('keeps an untagged routine private', async () => {
    const { result } = await mountLoaded()

    await act(async () => {
      await result.current.addRoutine({ name: 'New routine' })
    })

    expect(inserts[0].scope).toBe('individual')
  })

  it('shares a personal routine with the member it is handed to', async () => {
    const { result } = await mountLoaded()

    await act(async () => {
      await result.current.addRoutine({
        name: 'Monthly Financial Review', context: 'personal', assigned_to: 'member-partner',
      })
    })

    expect(inserts[0].scope).toBe('couple')
  })
})

describe('updateRoutine — tagging a routine family actually shares it', () => {
  it('shares the routine when its life area becomes family', async () => {
    mockRoutines.push(dbRoutine({ id: 'laundry', name: 'Iris laundry and clothes processing' }))
    const { result } = await mountLoaded()

    await act(async () => {
      await result.current.updateRoutine('laundry', { context: 'family' })
    })

    const write = writeFor('laundry')
    expect(write.context).toBe('family')
    expect(write.scope).toBe('compound')
  })

  it('takes the share back when a family routine is re-tagged private', async () => {
    mockRoutines.push(dbRoutine({ id: 'review', context: 'family', scope: 'compound' }))
    const { result } = await mountLoaded()

    await act(async () => {
      await result.current.updateRoutine('review', { context: 'personal' })
    })

    expect(writeFor('review').scope).toBe('individual')
  })

  it('recomputes a hand-set scope rather than preserving it', async () => {
    // Scope is not a choice any more: an unassigned private routine is
    // individual, whatever the column happened to hold.
    mockRoutines.push(dbRoutine({ id: 'meds', context: 'personal', scope: 'couple' }))
    const { result } = await mountLoaded()

    await act(async () => {
      await result.current.updateRoutine('meds', { context: 'work' })
    })

    expect(writeFor('meds').scope).toBe('individual')
  })

  it('does not touch scope on an update that leaves the life area alone', async () => {
    mockRoutines.push(dbRoutine({ id: 'plants', context: 'family', scope: 'compound' }))
    const { result } = await mountLoaded()

    await act(async () => {
      await result.current.updateRoutine('plants', { name: 'Water houseplants every Sunday' })
    })

    expect(writeFor('plants')).not.toHaveProperty('scope')
  })

  it('shares a routine handed to another member, without touching its area', async () => {
    mockRoutines.push(dbRoutine({ id: 'camp', context: 'personal' }))
    const { result } = await mountLoaded()

    await act(async () => {
      await result.current.updateRoutine('camp', { assigned_to: 'member-partner' })
    })

    const write = writeFor('camp')
    expect(write.scope).toBe('couple')
    expect(write).not.toHaveProperty('context')
  })

  it('takes the share back when the assignee is cleared', async () => {
    mockRoutines.push(dbRoutine({ id: 'camp', context: 'personal', scope: 'couple' }))
    const { result } = await mountLoaded()

    await act(async () => {
      await result.current.updateRoutine('camp', { assigned_to: null })
    })

    expect(writeFor('camp').scope).toBe('individual')
  })
})

// The self member id is module state, so it MUST be keyed by the auth user.
// Cached by nothing, a sign-out/sign-in in the same tab left the next user
// deriving scopes against the PREVIOUS member's id: a routine B assigns to A
// reads as "assigned to myself" and lands 'individual' — invisible to A.
describe('the self member id follows the signed-in user', () => {
  it('re-resolves when a different user signs in to the same tab', async () => {
    mockUser = { id: 'user-a', email: 'a@example.com' }
    const first = await mountLoaded()
    await act(async () => {
      await first.result.current.addRoutine({ name: 'PT exercises', assigned_to: 'member-a' })
    })
    // A assigning to A is not a share.
    expect(inserts[0].scope).toBe('individual')

    // Same tab, same module state, different user.
    mockUser = { id: 'user-b', email: 'b@example.com' }
    const second = await mountLoaded()
    await act(async () => {
      await second.result.current.addRoutine({ name: 'Trash night', assigned_to: 'member-a' })
    })
    // B assigning to A IS a share — and would have read as 'individual' while
    // the cache still held A's member id.
    expect(inserts[1].scope).toBe('couple')
  })
})
