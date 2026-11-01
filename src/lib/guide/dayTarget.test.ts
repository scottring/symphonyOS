import { describe, it, expect } from 'vitest'
import { dayTarget, dayStepTitle, dayCount } from './dayTarget'
import { stepsFor } from './steps'

describe('dayTarget', () => {
  it('before 4 pm plans today and looks back on yesterday', () => {
    expect(dayTarget(new Date(2026, 10, 2, 15, 59))).toEqual({
      target: new Date(2026, 10, 2), lookBackOn: new Date(2026, 10, 1), isTomorrow: false,
    })
  })
  it('from 4 pm plans tomorrow and looks back on today', () => {
    expect(dayTarget(new Date(2026, 10, 2, 16, 0))).toEqual({
      target: new Date(2026, 10, 3), lookBackOn: new Date(2026, 10, 2), isTomorrow: true,
    })
  })
  it('crosses a month end', () => {
    expect(dayTarget(new Date(2026, 9, 31, 20)).target).toEqual(new Date(2026, 10, 1))
  })
})

describe('dayStepTitle', () => {
  const step = (id: string) => stepsFor('day').find((s) => s.id === id)!
  it('keeps the written titles in the morning', () => {
    expect(dayStepTitle(step('look-back'), false)).toBe('Look back at yesterday')
    expect(dayStepTitle(step('calendar'), false)).toBe('Today\'s calendar')
  })
  it('in the evening the look back is today and the calendar tomorrow’s', () => {
    expect(dayStepTitle(step('look-back'), true)).toBe('Look back at today')
    expect(dayStepTitle(step('calendar'), true)).toBe('Tomorrow\'s calendar')
    expect(dayStepTitle(step('pick'), true)).toBe('Pick 3 to 5')
  })
})

describe('dayCount', () => {
  it('counts the tasks on the day, not its events or routines, each once', () => {
    expect(dayCount([
      { key: 'task-a', kind: 'task' }, { key: 'task-a', kind: 'task' }, { key: 'task-b', kind: 'task' },
      { key: 'event-1', kind: 'event' }, { key: 'routine-1', kind: 'routine' },
    ])).toBe(2)
  })
})
