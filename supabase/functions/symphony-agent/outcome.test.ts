import { describe, expect, it } from 'vitest'
import { summarizeTurn } from './outcome.ts'

const ok = (name: string, ...ids: string[]) => ({ name, ok: true, ids })
const bad = (name: string) => ({ name, ok: false, error: 'Error: nope' })

describe('summarizeTurn', () => {
  it('answered: nothing written, nothing shown', () => {
    expect(summarizeTurn([], {}, 'ok')).toEqual({ state: 'answered', writes: [], say: 'Nothing was changed.' })
  })
  it('proposed: a card is on the page and nothing saved', () => {
    const o = summarizeTurn([], { proposal: { key: 'k', title: '3 changes', ops: 3 } }, 'ok')
    expect(o.state).toBe('proposed')
    expect(o.proposal).toEqual({ key: 'k', title: '3 changes', ops: 3 })
    expect(o.say).toMatch(/Nothing is saved until/)
  })
  it('suggestions alone are proposed too', () => {
    expect(summarizeTurn([], { suggestions: 2 }, 'ok').state).toBe('proposed')
  })
  it('saved when every write reported ok, with the rows', () => {
    const o = summarizeTurn([ok('symphony_create_task', 'a')], {}, 'ok')
    expect(o.state).toBe('saved')
    expect(o.writes).toEqual([{ name: 'symphony_create_task', ok: true, ids: ['a'] }])
    expect(o.say).toBe('Saved.')
  })
  it('partial when some writes failed', () => {
    expect(summarizeTurn([ok('symphony_create_task', 'a'), bad('symphony_update_task')], {}, 'ok').state).toBe('partial')
  })
  it('failed when every write failed', () => {
    expect(summarizeTurn([bad('symphony_create_task')], {}, 'ok').state).toBe('failed')
  })
  it('a saved write beside a waiting card says both', () => {
    const o = summarizeTurn([ok('symphony_create_task', 'a')], { proposal: { key: 'k', title: '2 changes', ops: 2 } }, 'ok')
    expect(o.state).toBe('saved')
    expect(o.say).toMatch(/^Saved\. A change card is still waiting/)
  })
  it('a turn that errored after a write is unverified, before any write is failed', () => {
    expect(summarizeTurn([ok('symphony_create_task', 'a')], {}, 'error').state).toBe('unverified')
    expect(summarizeTurn([], {}, 'error').state).toBe('failed')
  })
})
