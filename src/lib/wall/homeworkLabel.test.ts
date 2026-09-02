import { describe, it, expect } from 'vitest'
import { homeworkDue, sortHomework } from './homeworkLabel'

const NOW = new Date(2026, 8, 2, 15, 0) // Wed Sep 2 2026, 3pm
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)

describe('homeworkDue', () => {
  it('undated → no label, not late', () => expect(homeworkDue(undefined, NOW)).toEqual({ label: null, late: false }))
  it('today', () => expect(homeworkDue(d(2026, 9, 2), NOW)).toEqual({ label: 'Today', late: false }))
  it('tomorrow', () => expect(homeworkDue(d(2026, 9, 3), NOW)).toEqual({ label: 'Tomorrow', late: false }))
  it('within six days → short weekday', () => expect(homeworkDue(d(2026, 9, 4), NOW)).toEqual({ label: 'Fri', late: false }))
  it('seven days out → month-day', () => expect(homeworkDue(d(2026, 9, 9), NOW)).toEqual({ label: 'Sep 9', late: false }))
  it('yesterday → Late', () => expect(homeworkDue(d(2026, 9, 1), NOW)).toEqual({ label: 'Late', late: true }))
})

describe('sortHomework', () => {
  it('late first, then dated ascending, undated last, ties by title', () => {
    const rows = [
      { title: 'B undated' }, { title: 'A undated' },
      { title: 'Fri', neededOn: d(2026, 9, 4) }, { title: 'Late', neededOn: d(2026, 8, 30) },
      { title: 'Today', neededOn: d(2026, 9, 2) },
    ]
    expect(sortHomework(rows, NOW).map((r) => r.title)).toEqual(['Late', 'Today', 'Fri', 'A undated', 'B undated'])
  })
})
