/**
 * The household edition gate, against the real project, as real accounts.
 *
 * A new household is 'light'. A signed-in person cannot change that, cannot
 * reach the AI while it is, and cannot slip into another household or hand
 * out memberships to get around it. Only the service role (the owner) moves
 * a household to 'full'.
 *
 * Accounts: L (light, the subject) and M (a bystander whose household is made
 * 'full' by the admin, the household L must not be able to move into).
 *
 * Needs the migration 20261113150000_household_edition.sql applied; written
 * ahead of that. Run it on purpose: `npm run test:integration`.
 */
import { type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  adminClient,
  callFunction,
  canRun,
  createPerson,
  householdOf,
  removePerson,
  sweepStaleAccounts,
  type Person,
} from './helpers'

let admin: SupabaseClient
let L: Person
let M: Person
let lHousehold: string
let mHousehold: string

const describeIf = canRun ? describe : describe.skip

const today = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

/** The body src/lib/chat/questionIdeas.ts sends; valid, so it reaches the allowance check. */
const ideasBody = {
  question: 'What should we make for dinner on Thursday?',
  today,
  conversation: [{ role: 'assistant', content: 'What should we make for dinner on Thursday?' }],
}

async function editionOf(householdId: string): Promise<string> {
  const { data, error } = await admin.from('households').select('edition').eq('id', householdId).single()
  if (error) throw new Error(`could not read edition: ${error.message}`)
  return data.edition as string
}

describeIf('household edition gate', () => {
  beforeAll(async () => {
    admin = adminClient()
    await sweepStaleAccounts(admin)

    const runId = Date.now().toString(36)
    L = await createPerson(admin, 'edition-l', runId)
    M = await createPerson(admin, 'edition-m', runId)
    lHousehold = await householdOf(admin, L)
    mHousehold = await householdOf(admin, M)

    const { error } = await admin.from('households').update({ edition: 'full' }).eq('id', mHousehold)
    if (error) throw new Error(`could not make M's household full: ${error.message}`)
  })

  afterAll(async () => {
    if (!admin) return
    for (const p of [L, M]) await removePerson(admin, p)
    for (const id of [lHousehold, mHousehold]) if (id) await admin.from('households').delete().eq('id', id)
  })

  it('starts light, with one active membership', async () => {
    const { data, error } = await admin
      .from('household_members')
      .select('household_id, status')
      .eq('user_id', L.userId)
    expect(error).toBeNull()
    expect(data).toEqual([{ household_id: lHousehold, status: 'active' }])
    expect(await editionOf(lHousehold)).toBe('light')
  })

  it('tells L it is light', async () => {
    const { data, error } = await L.client.rpc('my_edition')
    expect(error).toBeNull()
    expect(data).toBe('light')
  })

  it('keeps an update to full as it was, without an error', async () => {
    const { error } = await L.client.from('households').update({ edition: 'full' }).eq('id', lHousehold)
    expect(error).toBeNull()
    expect(await editionOf(lHousehold)).toBe('light')
    const { data } = await L.client.rpc('my_edition')
    expect(data).toBe('light')
  })

  it("will not move L's membership into the full household", async () => {
    const { error } = await L.client
      .from('household_members')
      .update({ household_id: mHousehold })
      .eq('user_id', L.userId)
    expect(error?.code).toBe('42501')

    const { data } = await admin.from('household_members').select('household_id').eq('user_id', L.userId)
    expect(data).toEqual([{ household_id: lHousehold }])
  })

  it('will not let L, owner of its household, add an active membership for someone else', async () => {
    const { error } = await L.client.from('household_members').insert({
      household_id: lHousehold,
      user_id: M.userId,
      role: 'member',
      status: 'active',
    })
    expect(error?.code).toBe('42501')

    const { data } = await admin
      .from('household_members')
      .select('household_id')
      .eq('user_id', M.userId)
      .eq('status', 'active')
    expect(data).toEqual([{ household_id: mHousehold }])
  })

  it('refuses the AI to a light household with 403 ai_light_edition and records no usage', async () => {
    const { status, json } = await callFunction(L, 'question-ideas', ideasBody)
    expect(status).toBe(403)
    expect(json.code).toBe('ai_light_edition')

    const { data, error } = await admin.from('ai_provider_call_usage').select('route').eq('user_id', L.userId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('opens the gate when the owner makes the household full', async () => {
    const { error } = await admin.from('households').update({ edition: 'full' }).eq('id', lHousehold)
    expect(error).toBeNull()

    const { data: edition } = await L.client.rpc('my_edition')
    expect(edition).toBe('full')

    const reserved = await admin.rpc('reserve_ai_budget', {
      p_user: L.userId,
      p_route: 'question-ideas',
      p_model: 'claude-sonnet-4-6',
      p_input: 1,
      p_output: 1,
    })
    expect(reserved.error).toBeNull()
    const result = reserved.data as { allowed: boolean; reservation_id?: string; reason?: string }
    expect(result.allowed).toBe(true)
    expect(result.reservation_id).toBeTruthy()

    const settled = await admin.rpc('settle_ai_budget', {
      p_id: result.reservation_id,
      p_user: L.userId,
      p_input: 0,
      p_output: 0,
    })
    expect(settled.error).toBeNull()
  })
})

// A run without the service key must say so rather than pass silently.
if (!canRun) {
  describe('household edition gate', () => {
    it.skip('needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY', () => {})
  })
}
