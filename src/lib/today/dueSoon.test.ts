import { describe, it, expect } from 'vitest'
import { dueLabel, isDueSoon } from './dueSoon'

const fri = new Date(2026, 10, 13, 9)
const d = (day: number) => new Date(2026, 10, day)

describe('a done-by date on Today (Scott, 2026-11-13)', () => {
  it('comes into To do three days before, not sooner', () => {
    expect(isDueSoon({ dueOn: d(16), completed: false }, fri)).toBe(true)
    expect(isDueSoon({ dueOn: d(17), completed: false }, fri)).toBe(false)
    expect(isDueSoon({ dueOn: undefined, completed: false }, fri)).toBe(false)
  })
  it('stays while it is overdue and open; a ticked one stays only on the day it was ticked', () => {
    expect(isDueSoon({ dueOn: d(10), completed: false }, fri)).toBe(true)
    expect(isDueSoon({ dueOn: d(16), completed: true, completedAt: new Date(2026, 10, 13, 8) }, fri)).toBe(true)
    expect(isDueSoon({ dueOn: d(16), completed: true, completedAt: d(12) }, fri)).toBe(false)
  })
  it('says how long is left in plain words', () => {
    expect(dueLabel(d(16), fri)).toBe('by Mon 16')
    expect(dueLabel(d(14), fri)).toBe('due tomorrow')
    expect(dueLabel(d(13), fri)).toBe('due today')
    expect(dueLabel(d(10), fri)).toBe('was due Tue 10')
  })
})
