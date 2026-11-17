/**
 * The walk's suggestions, against the real project, as a real light account.
 *
 * A light household may use ONE AI route, `walk-suggest` (ai_light_routes,
 * migration 20261117090000): three next steps for a goal in the iPhone walk.
 * Every other AI route still answers 403 ai_light_edition.
 *
 * Account: L (light, a brand-new throwaway account). Each passing run makes
 * one real model call (a fraction of a cent). Run it on purpose:
 * `npm run test:integration`.
 */
import { type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, callFunction, canRun, createPerson, householdOf, removePerson, sweepStaleAccounts, type Person } from './helpers'

let admin: SupabaseClient
let L: Person
let household: string

const describeIf = canRun ? describe : describe.skip

const today = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

const body = {
  level: 'month',
  area: 'Health',
  period: 'December',
  today,
  above: [
    { level: 'season', title: 'Come up with a nutrition plan' },
    { level: 'year', title: 'Get back to 175 pounds' },
  ],
  have: [],
}

async function usage(): Promise<{ route: string; calls: number }[]> {
  const { data, error } = await admin.from('ai_provider_call_usage').select('route, calls').eq('user_id', L.userId)
  if (error) throw new Error(error.message)
  return data as { route: string; calls: number }[]
}

describeIf('walk suggestions for a light household', () => {
  beforeAll(async () => {
    admin = adminClient()
    await sweepStaleAccounts(admin)
    L = await createPerson(admin, 'walk-suggest-l', Date.now().toString(36))
    household = await householdOf(admin, L)
  })

  afterAll(async () => {
    if (!admin || !L) return
    for (const table of ['ai_budget_reservations', 'ai_provider_call_usage', 'ai_spend']) {
      try { await admin.from(table).delete().eq('user_id', L.userId) } catch { /* a missing table is fine */ }
    }
    await removePerson(admin, L)
    if (household) await admin.from('households').delete().eq('id', household)
  })

  it('is a light household', async () => {
    const { data } = await L.client.rpc('my_edition')
    expect(data).toBe('light')
  })

  it('refuses a body it cannot read before any paid call', async () => {
    const { status } = await callFunction(L, 'walk-suggest', { ...body, level: 'year' })
    expect(status).toBe(400)
    expect(await usage()).toEqual([])
  })

  it('gives a light household up to three suggestions that fit a flag, and counts the call', async () => {
    const { status, json } = await callFunction(L, 'walk-suggest', body)
    expect(status, JSON.stringify(json)).toBe(200)
    const suggestions = json.suggestions as string[]
    console.log('walk-suggest →', suggestions)
    expect(suggestions.length).toBeGreaterThanOrEqual(1)
    expect(suggestions.length).toBeLessThanOrEqual(3)
    for (const s of suggestions) {
      expect(s.length).toBeGreaterThanOrEqual(3)
      expect(s.length).toBeLessThanOrEqual(44)
    }
    expect(await usage()).toEqual([{ route: 'walk-suggest', calls: 1 }])
  })

  it('still refuses every other AI route to a light household', async () => {
    const { status, json } = await callFunction(L, 'question-ideas', {
      question: 'What should we make for dinner on Thursday?', today,
      conversation: [{ role: 'assistant', content: 'What should we make for dinner on Thursday?' }],
    })
    expect(status).toBe(403)
    expect(json.code).toBe('ai_light_edition')
    expect(await usage()).toEqual([{ route: 'walk-suggest', calls: 1 }])
  })

  it('charged the household a fraction of a cent', async () => {
    const { data, error } = await admin.from('ai_spend').select('cents, route, model').eq('household_id', household)
    expect(error).toBeNull()
    const rows = (data ?? []) as { cents: number; route: string; model: string }[]
    console.log('walk-suggest spend →', rows)
    const total = rows.reduce((sum, r) => sum + Number(r.cents), 0)
    expect(total).toBeGreaterThan(0)
    expect(total).toBeLessThan(0.5)
  })
})
