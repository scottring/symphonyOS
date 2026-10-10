import { describe, expect, it } from 'vitest'
import { creationKey, proposalItems, stableRowId, toolOutcome } from './canvasEvents'

const TURN = '4f1c2a9e-7b3d-4c11-9a0e-2f6b8d1e3c55'

describe('toolOutcome', () => {
  it('reports saved rows and failures for write tools only', () => {
    expect(toolOutcome('symphony_list_tasks', '[]')).toBeNull()
    expect(toolOutcome('symphony_create_task', '{"id":"a1","title":"x"}')).toEqual({ type: 'tool_result', name: 'symphony_create_task', ok: true, ids: ['a1'] })
    expect(toolOutcome('symphony_create_plan_item', 'Error: Parent is unavailable')?.ok).toBe(false)
    expect(toolOutcome('symphony_update_task', '{"error":"nope"}')?.ok).toBe(false)
    expect(toolOutcome('symphony_create_note', 'Saved note')?.ok).toBe(true)
  })
})

describe('stableRowId', () => {
  it('is deterministic per user, turn and creation, and needs a valid turn id', async () => {
    const input = { title: '  Book a  Consultation ', level: 'month', parent_id: 'p1' }
    const a = await stableRowId('u1', TURN, 'symphony_create_plan_item', input)
    expect(await stableRowId('u1', TURN, 'symphony_create_plan_item', { ...input, title: 'book a consultation' })).toBe(a)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(await stableRowId('u2', TURN, 'symphony_create_plan_item', input)).not.toBe(a)
    expect(await stableRowId('u1', TURN, 'symphony_create_plan_item', { ...input, title: 'Choose a gym' })).not.toBe(a)
    expect(await stableRowId('u1', 'not-a-uuid', 'symphony_create_task', input)).toBeNull()
    expect(await stableRowId('u1', null, 'symphony_create_task', input)).toBeNull()
  })
  it('ignores case and spacing in titles', () => {
    expect(creationKey('t', { title: 'A  b' })).toBe(creationKey('t', { title: 'a b' }))
  })
})

describe('proposalItems', () => {
  it('validates items and drops malformed parents', () => {
    const ok = proposalItems({ items: [
      { title: 'Choose a picnic day', level: 'month', parent_id: TURN, period_start: '2026-10-01', reason: 'You mentioned a picnic' },
      { title: '', level: 'month' },
      { title: 'Bad level', level: 'decade' },
      { title: 'Bad parent', level: 'week', parent_id: "x'); drop table" },
    ] }, 'tu1')
    if ('error' in ok) throw new Error(ok.error)
    expect(ok.items).toHaveLength(2)
    expect(ok.items[0]).toEqual({ key: 'tu1:0', title: 'Choose a picnic day', level: 2, parentId: TURN, periodStart: '2026-10-01', reason: 'You mentioned a picnic' })
    expect(ok.items[1].parentId).toBeNull()
    expect('error' in proposalItems({ items: [] }, 'k')).toBe(true)
    expect('error' in proposalItems({ items: Array.from({ length: 13 }, () => ({ title: 'x', level: 'week' })) }, 'k')).toBe(true)
  })
})
