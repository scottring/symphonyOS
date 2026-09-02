import { describe, it, expect } from 'vitest'
import { isEventFree, freeKeyFor, eventNoteKeys } from './eventFree'
import type { EventNote } from '@/hooks/useEventNotes'

const note = (id: string, isFree: boolean): EventNote =>
  ({ id: 'n-' + id, googleEventId: id, notes: null, isFree, createdAt: new Date(0), updatedAt: new Date(0) }) as EventNote
const ev = (id: string, series?: string) => ({ id, google_event_id: id, title: 't', recurring_event_id: series ?? null }) as never

describe('isEventFree', () => {
  it('is false with no notes', () => { expect(isEventFree(ev('a'), undefined)).toBe(false) })
  it('reads the instance note', () => { expect(isEventFree(ev('a'), new Map([['a', note('a', true)]]))).toBe(true) })
  it('falls back to the series note', () => {
    expect(isEventFree(ev('a_1', 'a'), new Map([['a', note('a', true)]]))).toBe(true)
  })
  it('instance note wins over series, even when false', () => {
    const m = new Map([['a', note('a', true)], ['a_1', note('a_1', false)]])
    expect(isEventFree(ev('a_1', 'a'), m)).toBe(false)
  })
})
describe('freeKeyFor / eventNoteKeys', () => {
  it('uses the series id for recurring instances', () => { expect(freeKeyFor(ev('a_1', 'a'))).toBe('a') })
  it('uses the instance id otherwise', () => { expect(freeKeyFor(ev('a'))).toBe('a') })
  it('loads instance and series ids, deduped', () => {
    expect(eventNoteKeys([ev('a_1', 'a'), ev('a_2', 'a'), ev('b')])).toEqual(['a_1', 'a', 'a_2', 'b'])
  })
})
