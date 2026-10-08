import { describe, it, expect, vi, beforeEach } from 'vitest'

// A permissive chainable builder: every method returns the builder, and the
// builder is thenable so `await supabase.from(...)...` resolves to `result`.
const h = vi.hoisted(() => {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = []
  const results: Record<string, unknown> = {}
  // Results are looked up as `table.op` (the query's first op), then `table`.
  // An array is a queue: each query of that kind takes the next result.
  const make = (table: string) => {
    const b: Record<string, unknown> = {}
    let first: string | null = null
    const ops = ['select', 'insert', 'update', 'upsert', 'eq', 'is', 'limit', 'maybeSingle']
    for (const op of ops) {
      b[op] = (...args: unknown[]) => { calls.push({ table, op, args }); first ??= op; return b }
    }
    b.then = (resolve: (v: unknown) => void) => {
      const key = `${table}.${first}` in results ? `${table}.${first}` : table
      const r = results[key]
      resolve((Array.isArray(r) ? r.shift() : r) ?? { data: null, error: null, count: 0 })
    }
    return b
  }
  return {
    calls, results,
    rpc: vi.fn().mockResolvedValue({ data: 'hh-1', error: null }),
    from: vi.fn((table: string) => make(table)),
  }
})
vi.mock('@/lib/supabase', () => ({ supabase: { from: h.from, rpc: h.rpc } }))
vi.mock('@/hooks/useWeather', () => ({ setHomeCoords: vi.fn() }))

import { saveFirstRunSetup, skipFirstRunSetup, initialsFor, FirstRunSaveError } from './firstRun'
import { setHomeCoords } from '@/hooks/useWeather'

beforeEach(() => { h.calls.length = 0; h.rpc.mockClear(); vi.mocked(setHomeCoords).mockClear(); for (const k of Object.keys(h.results)) delete h.results[k]; localStorage.clear() })

const insertsFor = (table: string) => h.calls.filter((c) => c.table === table && c.op === 'insert').map((c) => c.args[0])

describe('saveFirstRunSetup', () => {
  it('creates the household, names you, adds the others, and stamps the profile with home', async () => {
    await saveFirstRunSetup('u1', {
      householdName: ' The Riveras ',
      yourName: 'Jess Rivera',
      others: [{ name: 'Sam', role: 'parent' }, { name: 'Liam Rivera', role: 'child' }],
      home: { lat: 39.29, lng: -76.61, label: 'Baltimore, Maryland' },
    })

    expect(h.rpc).toHaveBeenCalledWith('setup_household', { p_name: 'The Riveras' })

    // No existing self row → inserted as the full user, blue, order 0.
    const [selfInsert, othersInsert] = insertsFor('family_members') as [Array<Record<string, unknown>>, Array<Record<string, unknown>>]
    expect(selfInsert[0]).toMatchObject({ name: 'Jess Rivera', initials: 'JR', is_full_user: true, role_label: 'parent', display_order: 0, user_id: 'u1' })
    expect(othersInsert).toEqual([
      expect.objectContaining({ name: 'Sam', role_label: 'parent', is_full_user: false, display_order: 1, color: 'purple' }),
      expect.objectContaining({ name: 'Liam Rivera', initials: 'LR', role_label: 'child', display_order: 2, color: 'green' }),
    ])

    const upsert = h.calls.find((c) => c.table === 'user_profiles' && c.op === 'upsert')!.args[0] as Record<string, unknown>
    expect(upsert).toMatchObject({ user_id: 'u1', home_location: 'Baltimore, Maryland', home_lat: 39.29, home_lng: -76.61 })
    expect(typeof upsert.onboarding_completed_at).toBe('string')
    expect(setHomeCoords).toHaveBeenCalledWith(39.29, -76.61)
    expect(JSON.parse(localStorage.getItem('symphony_home_location')!)).toEqual({ name: 'Home', address: 'Baltimore, Maryland' })
  })

  it('renames an already-seeded self row instead of inserting a second one', async () => {
    h.results.family_members = { data: { id: 'fm-self' }, error: null }
    await saveFirstRunSetup('u1', { householdName: '', yourName: 'Jess', others: [], home: null })
    expect(h.rpc).toHaveBeenCalledWith('setup_household', { p_name: null })
    expect(insertsFor('family_members')).toHaveLength(0)
    const update = h.calls.find((c) => c.table === 'family_members' && c.op === 'update')!
    expect(update.args[0]).toMatchObject({ name: 'Jess', initials: 'J' })
    expect(setHomeCoords).not.toHaveBeenCalled()
  })

  // Beta-readiness audit 2026-10-08: failed writes were logged and setup was
  // stamped complete anyway, so a household could leave setup with nothing saved.
  const stamped = () => h.calls.some((c) => c.table === 'user_profiles' && c.op === 'upsert')
  const fail = (message: string) => ({ data: null, error: { message } })
  const form = { householdName: 'The Riveras', yourName: 'Jess', others: [{ name: 'Sam', role: 'parent' as const }, { name: 'Liam', role: 'child' as const }], home: null }

  it('does not finish setup when the household cannot be created', async () => {
    h.rpc.mockResolvedValueOnce(fail('function setup_household does not exist'))
    const err = await saveFirstRunSetup('u1', form).catch((e) => e)
    expect(err).toBeInstanceOf(FirstRunSaveError)
    expect(err.message).toMatch(/couldn't save your household/i)
    expect(err.message).toMatch(/still here/i)
    expect(insertsFor('family_members')).toHaveLength(0)
    expect(stamped()).toBe(false)
  })

  it('does not finish setup when your own row fails to save', async () => {
    h.results['family_members.insert'] = [fail('permission denied')]
    await expect(saveFirstRunSetup('u1', form)).rejects.toThrow(/couldn't save your name/i)
    expect(stamped()).toBe(false)
  })

  it('does not insert a second self row when the lookup itself fails', async () => {
    h.results['family_members.select'] = [fail('timeout')]
    await expect(saveFirstRunSetup('u1', form)).rejects.toThrow(FirstRunSaveError)
    expect(insertsFor('family_members')).toHaveLength(0)
    expect(stamped()).toBe(false)
  })

  it('does not finish setup when the people fail to save', async () => {
    h.results['family_members.insert'] = [{ data: null, error: null }, fail('network')]
    await expect(saveFirstRunSetup('u1', form)).rejects.toThrow(/people in your household/i)
    expect(stamped()).toBe(false)
  })

  it('retries after a partial save without duplicating anyone', async () => {
    // First try: self saved, Sam saved, then the profile stamp failed.
    h.results['user_profiles.upsert'] = [fail('network')]
    await expect(saveFirstRunSetup('u1', form)).rejects.toThrow(/couldn't save your setup/i)

    // Retry: self row now exists (renamed, not re-inserted), Sam is already saved.
    h.calls.length = 0
    h.results['family_members.select'] = [{ data: { id: 'fm-self' }, error: null }, { data: [{ name: 'sam ' }], error: null }]
    await saveFirstRunSetup('u1', form)
    const inserts = insertsFor('family_members') as Array<Array<Record<string, unknown>>>
    expect(inserts).toHaveLength(1)
    expect(inserts[0].map((r) => r.name)).toEqual(['Liam'])
    expect(h.calls.some((c) => c.table === 'family_members' && c.op === 'update')).toBe(true)
    expect(stamped()).toBe(true)
  })
})

describe('skipFirstRunSetup', () => {
  it('ensures a household exists and stamps the profile', async () => {
    await skipFirstRunSetup('u1')
    expect(h.rpc).toHaveBeenCalledWith('setup_household', { p_name: null })
    expect(h.calls.some((c) => c.table === 'user_profiles' && c.op === 'upsert')).toBe(true)
  })

  it('does not finish setup when the household cannot be created', async () => {
    h.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(skipFirstRunSetup('u1')).rejects.toThrow(FirstRunSaveError)
    expect(h.calls.some((c) => c.table === 'user_profiles' && c.op === 'upsert')).toBe(false)
  })
})

describe('initialsFor', () => {
  it('takes the first letter of up to two words', () => {
    expect(initialsFor('Jess Rivera')).toBe('JR')
    expect(initialsFor('liam')).toBe('L')
    expect(initialsFor('  ')).toBe('?')
  })
})
