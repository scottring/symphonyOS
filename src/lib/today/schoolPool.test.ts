import { describe, it, expect } from 'vitest'
import { selectSchoolPool, parseCaptureMeta, formatCaptureMeta } from './schoolPool'
import type { Task } from '@/types/task'

const t = (p: Partial<Task>): Task => ({ id: 'x', title: 'thing', completed: false, ...p } as Task)

describe('selectSchoolPool', () => {
  it('takes incomplete inbox tasks that came from a capture', () => {
    const out = selectSchoolPool([
      t({ id: 'a', bucket: 'inbox', captureId: 'c1' }),
      t({ id: 'b', bucket: 'inbox' }),                       // typed by hand
      t({ id: 'c', bucket: 'week', captureId: 'c2' }),       // already placed
      t({ id: 'd', bucket: 'inbox', captureId: 'c3', completed: true }),
    ])
    expect(out.map((x) => x.id)).toEqual(['a'])
  })

  it('orders oldest first, so the stalest school item is dealt with first', () => {
    const out = selectSchoolPool([
      t({ id: 'new', bucket: 'inbox', captureId: 'c', createdAt: new Date('2026-08-25') }),
      t({ id: 'old', bucket: 'inbox', captureId: 'c', createdAt: new Date('2026-08-20') }),
    ])
    expect(out.map((x) => x.id)).toEqual(['old', 'new'])
  })

  it('is empty when nothing has been captured', () => {
    expect(selectSchoolPool([t({ bucket: 'inbox' })])).toEqual([])
  })
})

describe('parseCaptureMeta', () => {
  // The exact note body candidateToTaskRow writes.
  const notes = [
    'Location: Room 12',
    'RSVP: to Ms Rozanc, by Thursday',
    'For: Kaleb',
    'Source: 3-01 Mr. Gorby (confidence 0.90)',
    'Proposed time: 2026-08-28T09:00:00',
  ].join('\n')

  it('pulls the source label out, without the confidence', () => {
    expect(parseCaptureMeta(notes).source).toBe('3-01 Mr. Gorby')
  })

  it('pulls the child out', () => {
    expect(parseCaptureMeta(notes).forWho).toBe('Kaleb')
  })

  it('returns nothing for notes that are not capture-shaped', () => {
    expect(parseCaptureMeta('just a normal note')).toEqual({})
  })

  it('returns nothing for undefined notes', () => {
    expect(parseCaptureMeta(undefined)).toEqual({})
  })
})

describe('formatCaptureMeta', () => {
  it('joins source and child with a separator', () => {
    expect(formatCaptureMeta({ source: '3B Parents', forWho: 'Kaleb' })).toBe('3B Parents · Kaleb')
  })

  it('shows the source alone when no child is named', () => {
    expect(formatCaptureMeta({ source: '3B Parents' })).toBe('3B Parents')
  })

  it('returns undefined when there is nothing to show', () => {
    expect(formatCaptureMeta({})).toBeUndefined()
  })
})
