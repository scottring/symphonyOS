import { describe, expect, it } from 'vitest'
import { orderWrites, taskStatusPatch } from './taskStatus'

const now = new Date('2026-11-11T15:00:00Z')
const at = (ymd: string) => `${ymd}T05:00:00.000Z`

describe('taskStatusPatch', () => {
  it('started stamps started_at and clears a wait, like the week sheet', () => {
    const input: Record<string, unknown> = { status: 'started' }
    expect(taskStatusPatch(input, null, now, at)).toEqual({ patch: { started_at: now.toISOString(), is_waiting: false, waiting_for: null, waiting_since: null } })
    expect(input).toEqual({})
  })

  it('waiting needs who, stamps a new wait, and a check-back day moves the task all-day', () => {
    expect(taskStatusPatch({ status: 'waiting' }, null, now, at)).toEqual({ error: expect.stringContaining('waiting_for') })
    const r = taskStatusPatch({ status: 'waiting', waiting_for: ' Iris ', check_back: '2026-11-14' }, null, now, at)
    expect(r).toEqual({ patch: { started_at: null, is_waiting: true, waiting_for: 'Iris', waiting_since: now.toISOString(), bucket: 'timed', scheduled_for: at('2026-11-14'), is_all_day: true } })
  })

  it('re-wording an existing wait keeps its clock', () => {
    const r = taskStatusPatch({ status: 'waiting', waiting_for: 'the plumber' }, { is_waiting: true, waiting_since: '2026-11-01T00:00:00Z' }, now, at)
    expect(r).toEqual({ patch: { started_at: null, is_waiting: true, waiting_for: 'the plumber' } })
  })

  it('not_started clears everything; bad values are refused', () => {
    expect(taskStatusPatch({ status: 'not_started' }, null, now, at)).toEqual({ patch: { started_at: null, is_waiting: false, waiting_for: null, waiting_since: null } })
    expect(taskStatusPatch({ status: 'done' }, null, now, at)).toHaveProperty('error')
    expect(taskStatusPatch({ status: 'waiting', waiting_for: 'x', check_back: '2026-02-30' }, null, now, at)).toHaveProperty('error')
    expect(taskStatusPatch({ waiting_for: 'Iris' }, null, now, at)).toHaveProperty('error')
    expect(taskStatusPatch({ is_waiting: true }, null, now, at)).toHaveProperty('error')
    expect(taskStatusPatch({ is_waiting: false }, null, now, at)).toEqual({ patch: { is_waiting: false, waiting_for: null, waiting_since: null } })
  })

  it('owed_to and needed_on sit beside the status', () => {
    const input: Record<string, unknown> = { owed_to: ' Kaisa ', needed_on: '2026-11-12', title: 'Invoice' }
    expect(taskStatusPatch(input, null, now, at)).toEqual({ patch: { owed_to: 'Kaisa', needed_on: '2026-11-12' } })
    expect(input).toEqual({ title: 'Invoice' })
    expect(taskStatusPatch({ owed_to: null, needed_on: null }, null, now, at)).toEqual({ patch: { owed_to: null, needed_on: null } })
    expect(taskStatusPatch({ needed_on: 'today' }, null, now, at)).toHaveProperty('error')
  })
})

describe('orderWrites', () => {
  it('spaces the list in the order given', () => {
    expect(orderWrites(['b', 'a', 'c'])).toEqual({ writes: [{ id: 'b', sort_order: 0 }, { id: 'a', sort_order: 1000 }, { id: 'c', sort_order: 2000 }] })
  })
  it('refuses short, duplicate or junk lists', () => {
    expect(orderWrites(['a'])).toHaveProperty('error')
    expect(orderWrites(['a', 'a'])).toHaveProperty('error')
    expect(orderWrites(['a', 3])).toHaveProperty('error')
    expect(orderWrites('a,b')).toHaveProperty('error')
  })
})
