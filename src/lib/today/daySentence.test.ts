import { describe, it, expect } from 'vitest'
import { daySentence, sayClock, type DaySentenceItem } from './daySentence'

const at = (h: number, m = 0) => new Date(2026, 9, 14, h, m)
const ev = (title: string, s: Date, e?: Date): DaySentenceItem => ({ title, start: s, end: e, kind: 'event' })
const task = (title: string, s: Date): DaySentenceItem => ({ title, start: s, kind: 'task' })
const routine = (title: string, s: Date, e?: Date): DaySentenceItem => ({ title, start: s, end: e, kind: 'routine' })

describe('daySentence', () => {
  it('says the mockup day: what is on until when, the open stretch, the last fixed thing tonight', () => {
    const items = [
      routine('School morning', at(7), at(8)),
      ev('CEPI standby', at(8), at(10)),
      ev('Pick up from FFG', at(17, 15)),
      task('Return field-trip permission slips', at(19)),
      routine('Kids bedtime routine', at(19, 30)),
    ]
    expect(daySentence({ items, now: at(9, 18) }).day)
      .toBe('CEPI standby until 10, then 7¼ hours open. Return field-trip permission slips at 7 tonight.')
  })

  it('an empty day says nothing', () => {
    expect(daySentence({ items: [], now: at(9) })).toEqual({ day: null, email: null })
  })

  it('names the room before the next thing when nothing else takes it first', () => {
    const items = [ev('Dentist', at(14), at(15))]
    expect(daySentence({ items, now: at(10) }).day).toBe('4 hours open, then Dentist at 2.')
  })

  it('a routine before the next thing ends the open stretch: the thing comes first', () => {
    const items = [routine('Lunch walk', at(11), at(12)), ev('Dentist', at(14), at(15))]
    expect(daySentence({ items, now: at(10, 30) }).day).toBe('Dentist at 2, then the rest of the day is open.')
  })

  it('another day reads from its first thing, with no clock', () => {
    const items = [ev('Swim meet', at(9), at(11)), ev('Dinner out', at(18, 30), at(20))]
    expect(daySentence({ items, now: null }).day).toBe('Swim meet at 9, then 7½ hours open. Dinner out at 6:30 tonight.')
  })

  it('done things are left out, and a day with only past things is open', () => {
    expect(daySentence({ items: [{ ...task('Call', at(9)), completed: true }], now: at(10) }).day).toBeNull()
    expect(daySentence({ items: [ev('Standup', at(9), at(9, 30))], now: at(12) }).day).toBe('The rest of the day is open.')
  })

  it('never names a routine', () => {
    const items = [routine('Kids bedtime routine', at(19, 30))]
    const s = daySentence({ items, now: at(9) }).day ?? ''
    expect(s).not.toMatch(/bedtime/)
  })

  it('folds in new email captures with the Inbox named', () => {
    expect(daySentence({ items: [], now: at(9), emailCount: 2 }).email).toBe('2 new from email.')
    expect(daySentence({ items: [], now: at(9), emailCount: 0 }).email).toBeNull()
  })

  it('says the clock as a person does', () => {
    expect(sayClock(at(10))).toBe('10')
    expect(sayClock(at(14, 30))).toBe('2:30')
    expect(sayClock(at(0, 5))).toBe('12:05')
  })
})
