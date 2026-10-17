import { describe, it, expect } from 'vitest'
import { gradeTurn, gradeRecords, gradeScenarioRecords, summarizeRun } from './grading.mjs'

const step = { expect: { outcome: ['proposed'], card: { ops: 1, contains: [{ op: 'routine_skip', routineId: 'piano', date: '2026-10-15' }] } } }
const got = { tools: [], reply: 'Nothing is saved until you approve.', outcome: { state: 'proposed' }, changeSet: { ops: [{ op: 'routine_skip', routineId: 'piano', date: '2026-10-15' }] } }
describe('live transaction grading', () => {
  it('rejects the historical false pass: Friday in a card that says Thursday', () => {
    expect(gradeTurn(step, { ...got, changeSet: { ops: [{ ...got.changeSet.ops[0], date: '2026-10-16' }] } })).toContainEqual(expect.stringContaining('missing card operation'))
    expect(gradeTurn(step, got)).toEqual([])
  })
  it('rejects missing cards, wrong targets and duplicates even when the tool and outcome look right', () => {
    expect(gradeTurn(step, { ...got, changeSet: undefined })).toContain('expected change card is missing')
    expect(gradeTurn(step, { ...got, changeSet: { ops: [{ ...got.changeSet.ops[0], routineId: 'soccer' }] } })).not.toEqual([])
    expect(gradeTurn({ expect: { outcome: ['proposed'], card: { ops: 2, contains: [got.changeSet.ops[0], got.changeSet.ops[0]] } } }, got)).not.toEqual([])
  })
  it('does not treat a truthful negative save statement as success or reject it for containing saved', () => {
    expect(gradeTurn(step, got)).toEqual([])
    expect(gradeTurn(step, { ...got, outcome: { state: 'saved' } })).not.toEqual([])
  })
  it('rejects a successful-looking reply if records are missing or have the wrong date', () => {
    const assertions = [{ table: 'tasks', where: { title: 'Call plumber' }, count: 1, fields: { date: '2026-10-16' } }]
    expect(gradeRecords(assertions, {})).not.toEqual([])
    expect(gradeRecords(assertions, { tasks: [] })).not.toEqual([])
    expect(gradeRecords(assertions, { tasks: [{ title: 'Call plumber', date: '2026-10-15' }] })).not.toEqual([])
    expect(gradeRecords(assertions, { tasks: [{ title: 'Call plumber', date: '2026-10-16' }] })).toEqual([])
  })
  it('checks unchanged bystanders independent of database row order', () => {
    const rows = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]
    expect(gradeRecords([{ table: 'tasks', unchanged: true }], { tasks: [...rows].reverse() }, { tasks: rows })).toEqual([])
    expect(gradeRecords([{ table: 'tasks', unchanged: true }], { tasks: [rows[0]] }, { tasks: rows })).not.toEqual([])
  })
  it('checks old scenario record assertions rather than silently ignoring them', () => {
    const s = { expect: { records: { count: { Plumber: 1 }, untouched: ['b'] }, routines: { skipped: [['piano', '2026-10-15']] } } }
    expect(gradeScenarioRecords(s, { tasks: [{ id: 'p', title: 'Plumber' }, { id: 'b', title: 'B' }], actionable_instances: [{ entity_id: 'piano', date: '2026-10-15', status: 'skipped' }] }, { tasks: [{ id: 'b', title: 'B' }] })).toEqual([])
    expect(gradeScenarioRecords(s, { tasks: [] }, {})).not.toEqual([])
  })
  it('never declares a skipped approval, blocked undo, or empty run passed', () => {
    for (const steps of [[], [{ status: 'skipped' }], [{ status: 'passed' }, { status: 'blocked' }]]) expect(summarizeRun(steps).status).toBe('incomplete')
    expect(summarizeRun([{ status: 'passed' }, { status: 'failed' }]).status).toBe('failed')
    expect(summarizeRun([{ status: 'passed' }]).status).toBe('passed')
  })
})
