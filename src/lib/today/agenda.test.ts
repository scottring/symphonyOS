import { describe, it, expect } from 'vitest'
import { buildAgenda, nextQuarter, type AgendaEntry } from './agenda'
import type { TimelineItem } from '@/types/timeline'

const day = new Date(2026, 10, 11)
const t = (h: number, m = 0) => new Date(2026, 10, 11, h, m)
const entry = (id: string, start: Date, end: Date, type: TimelineItem['type'] = 'event'): AgendaEntry => ({
  item: { id, title: id, type } as TimelineItem, start, end, hasEnd: true,
})

describe('buildAgenda — the day as a short list', () => {
  const lunch = entry('lunch', t(11, 30), t(12))
  const pickup = entry('pickup', t(17, 15), t(17, 45), 'routine')

  it('lists things in time order with the now line and the open stretches between them', () => {
    const rows = buildAgenda([pickup, lunch], { day, now: t(10, 13) })
    expect(rows.map((r) => (r.kind === 'item' ? r.entry.item.id : r.kind === 'open' ? r.label : r.kind))).toEqual([
      'now',
      '1¼ hours open, until 11:30',
      'lunch',
      '5¼ hours open, until 5:15',
      'pickup',
      'Evening open',
    ])
  })

  it('does not call the spent morning open; another day is open from its start', () => {
    const today = buildAgenda([lunch], { day, now: t(10, 13) })
    expect(today.find((r) => r.kind === 'open')).toMatchObject({ start: t(10, 13) })
    const otherDay = buildAgenda([lunch], { day, now: null })
    expect(otherDay[0]).toMatchObject({ kind: 'open', start: t(7), label: '4½ hours open, until 11:30' })
    expect(otherDay.some((r) => r.kind === 'now')).toBe(false)
  })

  it('names no open time when the calendars are not all in', () => {
    expect(buildAgenda([lunch], { day, now: t(9), showOpen: false }).some((r) => r.kind === 'open')).toBe(false)
  })

  it('a gap under an hour is not an open stretch', () => {
    const a = entry('a', t(9), t(10))
    const b = entry('b', t(10, 45), t(11))
    const rows = buildAgenda([a, b], { day, now: t(8, 59) })
    expect(rows.filter((r) => r.kind === 'open' && r.end <= t(11))).toHaveLength(0)
  })

  it('a change card’s timed arrival takes its place and its time', () => {
    const rows = buildAgenda([lunch], { day, now: t(10), proposals: [{ key: 'p', title: 'Dentist call', time: t(12, 30) }] })
    const ids = rows.map((r) => (r.kind === 'item' ? r.entry.item.id : r.kind === 'proposed' ? `+${r.proposal.title}` : r.kind))
    expect(ids.indexOf('+Dentist call')).toBeGreaterThan(ids.indexOf('lunch'))
    expect(rows.find((r) => r.kind === 'open' && r.start.getTime() === t(12).getTime())).toBeUndefined()
  })
})

describe('nextQuarter', () => {
  it('rounds up to the quarter hour, leaving a quarter as it is', () => {
    expect(nextQuarter(t(10, 13))).toEqual(t(10, 15))
    expect(nextQuarter(t(10, 15))).toEqual(t(10, 15))
    expect(nextQuarter(t(10, 46))).toEqual(t(11))
  })
})
