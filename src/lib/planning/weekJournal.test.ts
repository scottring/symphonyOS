import { describe, it, expect } from 'vitest'
import { likelyDuplicates, likelySame, weekSentence } from './weekJournal'

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m)
const day = (d: number, events: { title: string; time?: Date }[]) => ({ key: `2026-11-${String(d).padStart(2, '0')}`, date: at(d, 12), events })

describe('weekSentence', () => {
  const days = [day(10, [{ title: 'Boxing', time: at(10, 9) }]), day(11, [{ title: 'Veterans Day' }, { title: 'Lunch with mom', time: at(11, 11, 30) }]), day(12, [{ title: 'Dentist', time: at(12, 8) }])]
  it('says what comes next today, a stay that is on, and what is left', () => {
    expect(weekSentence({ days, spans: [{ title: 'Ron staying with us', from: '2026-11-06', to: '2026-11-15' }], now: at(11, 10, 30), todayKey: '2026-11-11', open: 7 }))
      .toBe('Lunch with mom today at 11:30am. Ron staying with us through Sunday. 7 still to do.')
  })
  it('after today’s last thing, names the next day’s; a stay that is over says nothing', () => {
    expect(weekSentence({ days, spans: [{ title: 'Ron staying with us', from: '2026-11-06', to: '2026-11-08' }], now: at(11, 13), todayKey: '2026-11-11', open: 0 }))
      .toBe('Dentist on Thursday.')
  })
})

describe('likely duplicates', () => {
  it('finds the same thing written twice, not two different things', () => {
    expect(likelySame('Scott book transport for winter break', 'Scott books transport (winter vacation)')).toBe(true)
    expect(likelySame('Iris check carefirst website for kk', 'Figure out kids bday presents')).toBe(false)
    expect(likelySame('Call mom', 'Call mom')).toBe(false) // too short to say
  })
  it('marks the later one with the earlier one’s title', () => {
    const dups = likelyDuplicates([
      { id: 'a', title: 'Scott book transport for winter break' },
      { id: 'b', title: 'Iris check carefirst website' },
      { id: 'c', title: 'Scott books transport (winter vacation)' },
    ])
    expect([...dups]).toEqual([['c', 'Scott book transport for winter break']])
  })
})
