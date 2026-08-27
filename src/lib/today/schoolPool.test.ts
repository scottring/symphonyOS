import { describe, it, expect } from 'vitest'
import { selectSchoolPool, parseCaptureMeta, formatCaptureDetail, isNewSince, countNewSince } from './schoolPool'
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

describe('isNewSince / countNewSince', () => {
  const at = (iso: string) => t({ bucket: 'inbox', captureId: 'c', createdAt: new Date(iso) })
  const SEEN = new Date('2026-08-26T12:00:00Z')

  it('counts everything as new before the pool has ever been opened', () => {
    expect(countNewSince([at('2026-08-01T00:00:00Z'), at('2026-08-26T00:00:00Z')], null)).toBe(2)
  })

  it('counts only what arrived after the last look', () => {
    expect(countNewSince([
      at('2026-08-26T11:00:00Z'),  // before
      at('2026-08-26T13:00:00Z'),  // after
      at('2026-08-27T09:00:00Z'),  // after
    ], SEEN)).toBe(2)
  })

  it('treats an item created exactly at the mark as already seen', () => {
    expect(isNewSince(at('2026-08-26T12:00:00Z'), SEEN)).toBe(false)
  })

  it('does not call an item new when it has no creation time to judge by', () => {
    // Better a missed dot than a dot that never clears.
    expect(isNewSince(t({ bucket: 'inbox', captureId: 'c' }), SEEN)).toBe(false)
  })

  it('still counts an undated item as new when nothing has been seen yet', () => {
    expect(isNewSince(t({ bucket: 'inbox', captureId: 'c' }), null)).toBe(true)
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

  it('pulls the location out', () => {
    expect(parseCaptureMeta(notes).location).toBe('Room 12')
  })

  it('pulls the RSVP out', () => {
    expect(parseCaptureMeta(notes).rsvp).toBe('to Ms Rozanc, by Thursday')
  })

  it('pulls the proposed time out verbatim', () => {
    expect(parseCaptureMeta(notes).proposedTime).toBe('2026-08-28T09:00:00')
  })

  it('pulls the sender, and does not confuse From with For', () => {
    const meta = parseCaptureMeta('For: Kaleb\nFrom: Ms. Rozanc')
    expect(meta.from).toBe('Ms. Rozanc')
    expect(meta.forWho).toBe('Kaleb')
  })

  it('pulls cost and gifts, which only some candidates carry', () => {
    const meta = parseCaptureMeta('Cost: $5\nGifts: no gifts please')
    expect(meta.cost).toBe('$5')
    expect(meta.gifts).toBe('no gifts please')
  })

  it('reads "unknown" as no proposed time at all', () => {
    expect(parseCaptureMeta('Proposed time: unknown').proposedTime).toBeUndefined()
  })

  it('returns nothing for notes that are not capture-shaped', () => {
    expect(parseCaptureMeta('just a normal note')).toEqual({})
  })

  it('returns nothing for undefined notes', () => {
    expect(parseCaptureMeta(undefined)).toEqual({})
  })
})

describe('formatCaptureDetail', () => {
  // Fixed reference date — this line says "Today", so a wall clock would rot
  // the suite the way the Tend tests once did.
  const REF = new Date('2026-08-25T12:00:00')

  it('leads with the day when the proposed time is a date', () => {
    expect(formatCaptureDetail({ proposedTime: '2026-08-25', forWho: 'Ella' }, REF))
      .toBe('Today · Ella')
  })

  it('says Tomorrow for the next day', () => {
    expect(formatCaptureDetail({ proposedTime: '2026-08-26' }, REF)).toBe('Tomorrow')
  })

  it('names the day for anything further out', () => {
    expect(formatCaptureDetail({ proposedTime: '2026-08-28' }, REF)).toBe('Fri, Aug 28')
  })

  it('appends the clock time when the candidate carries one', () => {
    expect(formatCaptureDetail({ proposedTime: '2026-08-25T07:40:00' }, REF))
      .toBe('Today 7:40a')
  })

  it('puts the facts in glance order: when, where, deadline, who', () => {
    expect(formatCaptureDetail({
      proposedTime: '2026-08-25T07:40:00',
      location: 'classroom',
      rsvp: 'to school, arrive on time',
      forWho: 'Kaleb',
    }, REF)).toBe('Today 7:40a · classroom · to school, arrive on time · Kaleb')
  })

  it('says Yesterday — school candidates linger, and most are past-dated', () => {
    expect(formatCaptureDetail({ proposedTime: '2026-08-24' }, REF)).toBe('Yesterday')
  })

  it('rewrites an ISO timestamp buried in the RSVP text', () => {
    expect(formatCaptureDetail({ rsvp: 'to school, by 2026-08-25T07:30:00, arrive on time' }, REF))
      .toBe('to school, by Today 7:30a, arrive on time')
  })

  it('drops the repeated day when the RSVP falls on the day already shown', () => {
    expect(formatCaptureDetail({
      proposedTime: '2026-08-25T07:40:00',
      location: 'classroom',
      rsvp: 'to school, by 2026-08-25T07:30:00, arrive on time',
      forWho: 'Ella',
    }, REF)).toBe('Today 7:40a · classroom · to school, by 7:30a, arrive on time · Ella')
  })

  it('keeps the day in the RSVP when it differs from the one shown', () => {
    expect(formatCaptureDetail({
      proposedTime: '2026-08-28',
      rsvp: 'by 2026-08-26T17:00:00',
    }, REF)).toBe('Fri, Aug 28 · by Tomorrow 5p')
  })

  it('includes cost and gifts when a candidate carries them', () => {
    expect(formatCaptureDetail({ cost: '$5', gifts: 'no gifts please', forWho: 'Ella' }, REF))
      .toBe('$5 · no gifts please · Ella')
  })

  it('names the sender last — who is asking changes how a request reads', () => {
    expect(formatCaptureDetail({ proposedTime: '2026-08-25', forWho: 'Ella', from: 'Ms. Rozanc' }, REF))
      .toBe('Today · Ella · Ms. Rozanc')
  })

  it('shows the sender even when no child was named', () => {
    expect(formatCaptureDetail({ source: 'HEMs Third Graders', from: 'Ariel' }, REF))
      .toBe('HEMs Third Graders · Ariel')
  })

  it('falls back to the source when no child was named — a WhatsApp item', () => {
    expect(formatCaptureDetail({ source: 'HEMs Third Graders' }, REF)).toBe('HEMs Third Graders')
  })

  it('prefers the child over the source, which the tooltip still carries', () => {
    expect(formatCaptureDetail({ source: '3-01 Mr. Gorby', forWho: 'Ella' }, REF)).toBe('Ella')
  })

  it('omits a proposed time it cannot parse rather than printing it raw', () => {
    expect(formatCaptureDetail({ proposedTime: 'sometime soon', forWho: 'Ella' }, REF)).toBe('Ella')
  })

  it('returns undefined when there is nothing to show', () => {
    expect(formatCaptureDetail({}, REF)).toBeUndefined()
  })
})
