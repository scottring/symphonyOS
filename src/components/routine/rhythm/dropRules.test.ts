import { describe, it, expect } from 'vitest'
import { resolveDrop } from './dropRules'

describe('collection-block target', () => {
  const target = { kind: 'collection-block', collectionId: 'bed' } as const
  it('folds steps, routines, and groups in as steps', () => {
    expect(resolveDrop({ kind: 'step', id: 's1' }, target))
      .toEqual({ type: 'add-steps', collectionId: 'bed', ids: ['s1'] })
    expect(resolveDrop({ kind: 'routine', id: 'r1' }, target))
      .toEqual({ type: 'add-steps', collectionId: 'bed', ids: ['r1'] })
    expect(resolveDrop({ kind: 'group', ids: ['a', 'b'] }, target))
      .toEqual({ type: 'add-steps', collectionId: 'bed', ids: ['a', 'b'] })
  })
  it('rejects collections (no nesting) and self-drops', () => {
    expect(resolveDrop({ kind: 'collection', id: 'camp' }, target)).toBeNull()
    expect(resolveDrop({ kind: 'routine', id: 'bed' }, target)).toBeNull()
    expect(resolveDrop({ kind: 'group', ids: ['x', 'bed'] }, target)).toBeNull()
  })
})

describe('axis target', () => {
  const target = { kind: 'axis', time: '07:15' } as const
  it('promotes steps to stand alone at the drop time', () => {
    expect(resolveDrop({ kind: 'step', id: 's1' }, target))
      .toEqual({ type: 'stand-alone-at', id: 's1', time: '07:15' })
  })
  it('retimes routines and collections', () => {
    expect(resolveDrop({ kind: 'routine', id: 'r1' }, target))
      .toEqual({ type: 'retime', id: 'r1', time: '07:15' })
    expect(resolveDrop({ kind: 'collection', id: 'camp' }, target))
      .toEqual({ type: 'retime', id: 'camp', time: '07:15' })
  })
  it('shifts whole groups', () => {
    expect(resolveDrop({ kind: 'group', ids: ['a', 'b'] }, target))
      .toEqual({ type: 'shift-group', ids: ['a', 'b'], time: '07:15' })
  })
})

describe('week-day target', () => {
  const thu = { kind: 'week-day', day: 'thu' } as const
  it('moves one day of a multi-day routine when fromDay is known', () => {
    expect(resolveDrop({ kind: 'routine', id: 'r1', fromDay: 'sat' }, thu))
      .toEqual({ type: 'move-day', id: 'r1', fromDay: 'sat', toDay: 'thu' })
  })
  it("is a no-op on the chip's own day", () => {
    expect(resolveDrop({ kind: 'routine', id: 'r1', fromDay: 'thu' }, thu)).toBeNull()
  })
  it('sets weekly-on for day payloads without a source day', () => {
    expect(resolveDrop({ kind: 'routine', id: 'r1' }, thu))
      .toEqual({ type: 'weekly-on', ids: ['r1'], day: 'thu' })
    expect(resolveDrop({ kind: 'step', id: 's1' }, thu))
      .toEqual({ type: 'weekly-on', ids: ['s1'], day: 'thu' })
    expect(resolveDrop({ kind: 'collection', id: 'camp' }, thu))
      .toEqual({ type: 'weekly-on', ids: ['camp'], day: 'thu' })
    expect(resolveDrop({ kind: 'group', ids: ['a', 'b'] }, thu))
      .toEqual({ type: 'weekly-on', ids: ['a', 'b'], day: 'thu' })
  })
})
