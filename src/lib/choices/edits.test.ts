import { describe, it, expect } from 'vitest'
import {
  applyWorkDiff, renamedColumn, restoredColumn, revertWorkDiff, withColumn, withSelected, withValue, withoutColumn, workDiff,
} from './edits'
import type { ChoiceColumn, WorkPiece } from '@/types/choice'

const A: ChoiceColumn = { id: 'a', label: 'Start', kind: 'date' }
const B: ChoiceColumn = { id: 'b', label: 'Bid', kind: 'money' }
const P: ChoiceColumn = { id: 'p', label: 'Partner', kind: 'text' } // added on another device
const MAIN: WorkPiece = { id: 'main', label: 'Main bath' }
const HALL: WorkPiece = { id: 'hall', label: 'Hall bath' }
const KIDS: WorkPiece = { id: 'kids', label: "Kids' bath" }
const BASE: WorkPiece = { id: 'base', label: 'Basement' } // added on another device

describe('one change onto a fresh read', () => {
  it('values: sets or removes one key, keeping the others', () => {
    expect(withValue({ a: '2026-12-01', p: 'x' }, 'b', 100)).toEqual({ a: '2026-12-01', p: 'x', b: 100 })
    expect(withValue({ a: '2026-12-01', b: 100 }, 'b', null)).toEqual({ a: '2026-12-01' })
    expect(withValue({ a: '2026-12-01' }, 'b', undefined)).toEqual({ a: '2026-12-01' })
  })

  it('columns: add, rename, remove and put back keep a partner\'s column', () => {
    expect(withColumn([A, P], B)).toEqual([A, P, B])
    expect(withColumn([A, B], B)).toEqual([A, B])
    expect(renamedColumn([A, B, P], 'b', 'Quote')).toEqual([A, { ...B, label: 'Quote' }, P])
    expect(renamedColumn([A, P], 'b', 'Quote')).toBeNull()
    expect(withoutColumn([A, B, P], 'b')).toEqual([A, P])
    expect(restoredColumn([A, P], B, 1)).toEqual([A, B, P])
    expect(restoredColumn([A], B, 5)).toEqual([A, B])
    expect(restoredColumn([A, B], B, 0)).toEqual([A, B])
  })

  it('work ticks: one piece on or off, in the work\'s order', () => {
    expect(withSelected([MAIN, HALL, KIDS], ['kids', 'main'], 'hall', true)).toEqual(['main', 'hall', 'kids'])
    expect(withSelected([MAIN, HALL, KIDS], ['main', 'hall', 'kids'], 'hall', false)).toEqual(['main', 'kids'])
    // A piece removed elsewhere is not ticked back on.
    expect(withSelected([MAIN, KIDS], ['main'], 'hall', true)).toEqual(['main'])
  })

  it('Edit the work: only what the save changed lands, and Undo takes back only that', () => {
    const next = [{ ...MAIN, description: 'Gut it' }, KIDS, { id: 'attic', label: 'Attic' }]
    const d = workDiff([MAIN, HALL, KIDS], ['main', 'hall'], next)
    expect(d.added.map((p) => p.id)).toEqual(['attic'])
    expect(d.removed).toEqual([{ piece: HALL, index: 1, selected: true }])
    expect(d.changed).toEqual([{ before: MAIN, after: next[0] }])

    const fresh = { work: [MAIN, HALL, KIDS, BASE], selectedWork: ['main', 'hall', 'base'] }
    const saved = applyWorkDiff(fresh, d)
    expect(saved).toEqual({ work: [next[0], KIDS, BASE, next[2]], selectedWork: ['main', 'base'] })
    expect(revertWorkDiff(saved, d)).toEqual(fresh)
  })

  it('a first list of pieces starts all selected', () => {
    const d = workDiff([], [], [MAIN, HALL])
    expect(applyWorkDiff({ work: [], selectedWork: [] }, d)).toEqual({ work: [MAIN, HALL], selectedWork: ['main', 'hall'] })
    expect(revertWorkDiff({ work: [MAIN, HALL], selectedWork: ['main', 'hall'] }, d)).toEqual({ work: [], selectedWork: [] })
  })
})
