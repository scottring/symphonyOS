import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RoutineRow, whenLabel, timeLabel } from './RoutineRow'
import type { Routine } from '@/types/actionable'

let n = 0
const mk = (over: Partial<Routine>): Routine => ({
  id: `r${++n}`, name: 'R', is_active: true, visibility: 'active',
  recurrence_pattern: { type: 'daily' }, context: 'family', scope: 'compound',
  ...over,
} as Routine)

const IRIS = { id: 'iris', name: 'Iris' } as never
const SCOTT = { id: 'scott', name: 'Scott' } as never

describe('timeLabel', () => {
  it('says a time the way a person does', () => {
    expect(timeLabel('19:00:00')).toBe('7 pm')
    expect(timeLabel('07:30:00')).toBe('7:30 am')
    expect(timeLabel('00:00:00')).toBe('12 am')
    expect(timeLabel('12:15:00')).toBe('12:15 pm')
    expect(timeLabel(null)).toBeNull()
  })
})

describe('whenLabel', () => {
  it('a daily routine says its time, or that the time is flexible', () => {
    expect(whenLabel(mk({ time_of_day: '19:00:00' }))).toBe('7 pm')
    expect(whenLabel(mk({ time_of_day: null }))).toBe('Flexible time')
  })

  it('a weekly routine names its days — once, however many there are', () => {
    expect(whenLabel(mk({ recurrence_pattern: { type: 'weekly', days: ['sun'] } }))).toBe('Sunday')
    expect(whenLabel(mk({ recurrence_pattern: { type: 'weekly', days: ['mon', 'wed'] } }))).toBe('Monday and Wednesday')
    expect(whenLabel(mk({ recurrence_pattern: { type: 'weekly', days: ['sat', 'sun'] } }))).toBe('Weekends')
    expect(whenLabel(mk({ recurrence_pattern: { type: 'weekly', days: ['tue', 'thu', 'sat'] } })))
      .toBe('Tuesday, Thursday, Saturday')
    expect(whenLabel(mk({ recurrence_pattern: { type: 'weekly', days: ['mon', 'tue', 'wed', 'thu', 'fri'] } })))
      .toBe('Weekdays')
  })

  it('flexibility is STATED, never hidden — an unpinned weekly is still a commitment', () => {
    expect(whenLabel(mk({ recurrence_pattern: { type: 'weekly' } }))).toBe('Flexible day')
    expect(whenLabel(mk({ recurrence_pattern: { type: 'weekly' }, time_of_day: '09:00:00' })))
      .toBe('Flexible day · 9 am')
  })

  it('past the week it answers WHEN, not how often — the heading says how often', () => {
    expect(whenLabel(mk({ recurrence_pattern: { type: 'monthly', day_of_month: 1 } }))).toBe('On the 1st')
    expect(whenLabel(mk({ recurrence_pattern: { type: 'monthly', day_of_month: 23 } }))).toBe('On the 23rd')
    expect(whenLabel(mk({ recurrence_pattern: { type: 'monthly' } }))).toBe('Flexible day of the month')
    expect(whenLabel(mk({ recurrence_pattern: { type: 'quarterly' } }))).toBe('Once a season')
    expect(whenLabel(mk({ recurrence_pattern: { type: 'yearly', month_of_year: 3 } }))).toBe('In March')
    expect(whenLabel(mk({ recurrence_pattern: { type: 'yearly' } }))).toBe('Once a year')
  })

  it('falls back to the cadence vocabulary for a span it cannot place', () => {
    // 'since_last' is a different promise from a schedule — the clock starts
    // at the last time you did it.
    expect(whenLabel(mk({ recurrence_pattern: { type: 'since_last', interval: 6, unit: 'weeks' } })))
      .toBe('6 weeks after the last time')
    expect(whenLabel(mk({ recurrence_pattern: { type: 'since_last', interval: 1, unit: 'months' } })))
      .toBe('1 month after the last time')
  })
})

describe('RoutineRow', () => {
  it('shows the name, the when and the who without being opened', () => {
    render(
      <RoutineRow
        routine={mk({ name: 'Kids bedtime', time_of_day: '19:00:00', assigned_to_all: ['scott', 'iris'] })}
        familyMembers={[SCOTT, IRIS]}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByText('Kids bedtime')).toBeInTheDocument()
    expect(screen.getByText('7 pm')).toBeInTheDocument()
    expect(screen.getByText('Scott, Iris')).toBeInTheDocument()
  })

  it('expands in place to state the pattern in full', () => {
    render(
      <RoutineRow
        routine={mk({ name: 'Food shopping', recurrence_pattern: { type: 'weekly', days: ['sun'] } })}
        familyMembers={[]}
        detail="next Sep 20"
        onOpen={vi.fn()}
      />,
    )
    expect(screen.queryByText(/Every Sun/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show details for Food shopping' }))
    expect(screen.getByText(/Every Sun/)).toBeInTheDocument()
    expect(screen.getByText(/next Sep 20/)).toBeInTheDocument()
  })

  it('the name opens the routine; the chevron only expands', () => {
    const onOpen = vi.fn()
    const r = mk({ name: 'Kitchen laundry' })
    render(<RoutineRow routine={r} familyMembers={[]} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show details for Kitchen laundry' }))
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Kitchen laundry'))
    expect(onOpen).toHaveBeenCalledWith(r)
  })

  it('a when override wins — a resting routine says when it wakes, not its pattern', () => {
    render(
      <RoutineRow
        routine={mk({ name: 'Camp mornings', visibility: 'reference', time_of_day: '07:00:00' })}
        familyMembers={[]}
        when="wakes Jun 2027"
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByText('wakes Jun 2027')).toBeInTheDocument()
    expect(screen.queryByText('7 am')).not.toBeInTheDocument()
  })

  it('counts a collection\'s steps on its one row', () => {
    render(<RoutineRow routine={mk({ name: 'Bedtime' })} familyMembers={[]} steps={4} onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Bedtime · 4 steps/ })).toBeInTheDocument()
  })
})
