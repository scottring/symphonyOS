import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseHorizonInput, landingFor } from './horizonInput'

const members = [
  { id: 'sk', name: 'Scott', role_label: 'parent' },
  { id: 'ir', name: 'Iris', role_label: 'parent' },
  { id: 'ka', name: 'Kaleb', role_label: 'child' },
  { id: 'el', name: 'Ella', role_label: 'child' },
]

describe('parseHorizonInput', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 25, 9, 0)) })
  afterEach(() => { vi.useRealTimers() })

  it('reads who, when and where out of a spoken sentence', () => {
    const p = parseHorizonInput('Appointment at dentist for K and E Nov 23 at 9am at cross keys', members)
    expect(p.title).toBe('Dentist appointment')
    expect(p.people).toEqual(['ka', 'el'])
    expect(p.location).toBe('Cross Keys')
    expect(p.hasTime).toBe(true)
    expect(p.date?.getFullYear()).toBe(2026)
    expect(p.date?.getMonth()).toBe(10)
    expect(p.date?.getDate()).toBe(23)
    expect(p.date?.getHours()).toBe(9)
  })

  it('reads names, "the kids" and a weekday', () => {
    const p = parseHorizonInput('Haircut for the kids thursday 4pm at Old Bank', members)
    expect(p.title).toBe('Haircut')
    expect(p.people).toEqual(['ka', 'el'])
    expect(p.location).toBe('Old Bank')
    expect(p.date?.getDate()).toBe(29)
    expect(p.date?.getHours()).toBe(16)
  })

  it('leaves "for" alone when it names no one', () => {
    const p = parseHorizonInput('Look for a good book', members)
    expect(p.title).toBe('Look for a good book')
    expect(p.people).toEqual([])
    expect(p.date).toBeUndefined()
  })

  it('an initial two members share names no one', () => {
    const p = parseHorizonInput('Call for S', [...members, { id: 'sa', name: 'Sam' }])
    expect(p.people).toEqual([])
  })

  it('a time after "at" is not a place', () => {
    const p = parseHorizonInput('Pick up Iris at 5pm', members)
    expect(p.location).toBeUndefined()
    expect(p.date?.getHours()).toBe(17)
  })
})

describe('landingFor', () => {
  const week = { start: new Date(2026, 9, 24), end: new Date(2026, 9, 30) }
  it('a date in the period lands on its day; outside, it says so', () => {
    expect(landingFor({ date: new Date(2026, 9, 27, 9) }, week)).toMatchObject({ kind: 'day', inPeriod: true })
    expect(landingFor({ date: new Date(2026, 10, 23, 9) }, week)).toMatchObject({ kind: 'day', inPeriod: false })
  })
  it('no date: the day it was typed on, else the period', () => {
    expect(landingFor({}, week, new Date(2026, 9, 28))).toMatchObject({ kind: 'day', inPeriod: true })
    expect(landingFor({}, week)).toEqual({ kind: 'period' })
  })
})
