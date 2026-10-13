import { describe, expect, it } from 'vitest'
import { wallSnapshot } from './wallSnapshot'

describe('what the wall knows, as plain lines', () => {
  const now = new Date(2026, 9, 13, 15, 10)

  it('lists today, the kids, dinner and what is coming up', () => {
    const text = wallSnapshot({
      now,
      weather: { temp: 71.6, condition: 'Clear' },
      today: [
        { time: '9:00a', end: '10:15a', title: 'Boxing', who: ['Scott'], past: true },
        { time: '4:15p', title: 'Homework time', who: ['Liam', 'Mia'] },
      ],
      kids: [{ name: 'Mia', special: 'PE', pickup: { time: '3:30p', who: null }, needed: [{ title: 'Library book', tomorrow: false }], homework: [{ title: 'Spelling', due: 'Today', late: false }], afterSchool: [{ title: 'Read', time: null, done: false }] }],
      dinnerTonight: { title: 'Tacos', at: '6:00 PM' },
      comingUp: [{ dayLabel: 'Thu', summary: 'Return field trip slips' }],
    })
    expect(text).toContain('Now: Tuesday, October 13, 3:10 PM.')
    expect(text).toContain('Weather: 72°, Clear.')
    expect(text).toContain('- 9:00a–10:15a Boxing (Scott) [done/past]')
    expect(text).toContain('- 4:15p Homework time (Liam, Mia)')
    expect(text).toContain('Mia: special today: PE · pickup at 3:30p, nobody has claimed it yet · needs today: Library book · homework: Spelling (due Today) · after school: Read.')
    expect(text).toContain('Dinner tonight: Tacos at 6:00 PM.')
    expect(text).toContain('- Thu: Return field trip slips')
  })

  it('says plainly when nothing is planned, and stays short', () => {
    const text = wallSnapshot({ now, today: [], dinnerTonight: null })
    expect(text).toContain('- nothing scheduled')
    expect(text).toContain('Dinner tonight: nothing planned.')
    const long = wallSnapshot({ now, today: Array.from({ length: 400 }, (_, i) => ({ time: '1p', title: `Thing ${i}`, who: [] })) })
    expect(long.length).toBeLessThanOrEqual(6000)
  })
})
