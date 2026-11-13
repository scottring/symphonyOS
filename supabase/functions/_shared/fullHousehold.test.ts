import { describe, it, expect } from 'vitest'
import { fullHouseholdGate, FULL_HOUSEHOLD_ONLY, type EditionAnswer } from './fullHousehold'

const gate = (answer: EditionAnswer | (() => Promise<EditionAnswer>)) =>
  fullHouseholdGate({ edition: typeof answer === 'function' ? answer : async () => answer })

describe('fullHouseholdGate', () => {
  it('allows a full household', async () => {
    expect(await gate({ data: 'full', error: null })).toBe('allow')
  })

  it('refuses a light household', async () => {
    expect(await gate({ data: 'light', error: null })).toBe('refuse')
  })

  it('allows while my_edition does not exist yet (PGRST202): behaves as before the edition migration', async () => {
    expect(await gate({ data: null, error: { code: 'PGRST202' }, status: 404 })).toBe('allow')
    expect(await gate({ data: null, error: { code: 'PGRST202' } })).toBe('allow')
  })

  it('allows on an HTTP 404 from the function call', async () => {
    expect(await gate({ data: null, error: { code: '' }, status: 404 })).toBe('allow')
    expect(await gate({ data: null, error: {}, status: 404 })).toBe('allow')
  })

  it.each([
    ['permission denied (anon key, no sign-in)', { data: null, error: { code: '42501' }, status: 401 }],
    ['an expired or bad JWT', { data: null, error: { code: 'PGRST301' }, status: 401 }],
    ['a server error', { data: null, error: { code: 'XX000' }, status: 500 }],
    ['an error with no code', { data: null, error: {}, status: 503 }],
    ['an error even when data says full', { data: 'full', error: { code: '57014' }, status: 500 }],
  ])('refuses on any other error: %s', async (_n, answer) => {
    expect(await gate(answer as EditionAnswer)).toBe('refuse')
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['Full (case)', 'Full'],
    ['pro', 'pro'],
    ['a number', 1],
    ['an object', { edition: 'full' }],
  ])('refuses an unexpected value: %s', async (_n, data) => {
    expect(await gate({ data, error: null })).toBe('refuse')
  })

  it('refuses when the lookup throws (network down)', async () => {
    expect(
      await gate(async () => {
        throw new Error('fetch failed')
      }),
    ).toBe('refuse')
  })

  it('the refusal body is the agreed one', () => {
    expect(FULL_HOUSEHOLD_ONLY).toEqual({ error: 'This comes with Symphony Plus.', code: 'full_household_only' })
  })
})
