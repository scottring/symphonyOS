import { describe, it, expect, vi } from 'vitest'
import { parseRoutineProposal, scheduleSummary, createFromProposal } from './routineImport'

const PT = {
  name: 'Shoulder PT exercises',
  recurrence: { type: 'weekly', days: ['Monday', 'Wednesday', 'friday'] },
  timeOfDay: '07:30',
  timesPerDay: 2,
  steps: [
    { name: 'Pendulum swings', detail: '2 sets × 10 each direction, arm relaxed' },
    { name: 'Wall slides', detail: '3 × 12, stop at pain' },
  ],
}

describe('parseRoutineProposal', () => {
  it('accepts a full proposal and normalizes day casing', () => {
    const p = parseRoutineProposal(PT)!
    expect(p.name).toBe('Shoulder PT exercises')
    expect(p.recurrence).toEqual({ type: 'weekly', days: ['monday', 'wednesday', 'friday'] })
    expect(p.timeOfDay).toBe('07:30')
    expect(p.timesPerDay).toBe(2)
    expect(p.steps).toHaveLength(2)
  })

  it('falls back to daily on garbage recurrence and drops nameless steps', () => {
    const p = parseRoutineProposal({ name: 'X', recurrence: { type: 'weekly', days: ['blursday'] }, steps: [{ detail: 'no name' }, { name: 'Real' }] })!
    expect(p.recurrence).toEqual({ type: 'daily' })
    expect(p.steps.map((s) => s.name)).toEqual(['Real'])
  })

  it('rejects proposals without a name', () => {
    expect(parseRoutineProposal({ steps: [] })).toBeNull()
    expect(parseRoutineProposal(null)).toBeNull()
  })

  it('drops malformed time and sub-2 dosing', () => {
    const p = parseRoutineProposal({ name: 'X', timeOfDay: 'seven am', timesPerDay: 1, steps: [] })!
    expect(p.timeOfDay).toBeNull()
    expect(p.timesPerDay).toBeNull()
  })
})

describe('scheduleSummary', () => {
  it('reads like the panels do', () => {
    expect(scheduleSummary(parseRoutineProposal(PT)!)).toBe('Weekly · monday, wednesday, friday · 07:30 · 2× per day')
    expect(scheduleSummary(parseRoutineProposal({ name: 'X', steps: [] })!)).toBe('Daily')
  })
})

describe('createFromProposal', () => {
  it('creates parent first, then steps in order with lineage to the parent', async () => {
    const calls: unknown[] = []
    const addRoutine = vi.fn(async (input: unknown) => { calls.push(input); return { id: `r${calls.length}` } })
    const parentId = await createFromProposal(parseRoutineProposal(PT)!, addRoutine, 'personal')
    expect(parentId).toBe('r1')
    expect(addRoutine).toHaveBeenCalledTimes(3)
    const [parent, s1, s2] = calls as Array<Record<string, unknown>>
    expect(parent.name).toBe('Shoulder PT exercises')
    // times_per_day in the DB is a string[] of clock times we'd have to
    // invent — the prescribed count lands in the description instead.
    expect(parent.times_per_day).toBeUndefined()
    expect(parent.description).toBe('Prescribed 2× per day.')
    expect(parent.context).toBe('personal')
    expect(s1).toMatchObject({ name: 'Pendulum swings', parent_routine_id: 'r1', step_order: 0, description: '2 sets × 10 each direction, arm relaxed' })
    expect(s2).toMatchObject({ name: 'Wall slides', parent_routine_id: 'r1', step_order: 1 })
  })

  it('stops cleanly when the parent fails', async () => {
    const addRoutine = vi.fn(async () => null)
    expect(await createFromProposal(parseRoutineProposal(PT)!, addRoutine)).toBeNull()
    expect(addRoutine).toHaveBeenCalledTimes(1)
  })
})
