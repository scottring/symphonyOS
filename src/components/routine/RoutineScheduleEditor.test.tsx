import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RoutineScheduleEditor } from './RoutineScheduleEditor'
import type { RecurrencePattern } from '@/types/actionable'

const show = (recurrencePattern: RecurrencePattern) =>
  render(<RoutineScheduleEditor recurrencePattern={recurrencePattern} timeOfDay="" onChange={vi.fn()} />)

// S3-11 and §P: the schedule's words have to match what saving does. A weekly
// routine with no day saves and runs as a flexible one, and Daily and
// "Weekly, all seven days" are the same routine — the editor said neither.
describe('RoutineScheduleEditor explains the schedule it will save', () => {
  it('no day chosen reads as a flexible day, not as an error', () => {
    show({ type: 'weekly', days: [] })
    expect(screen.queryByText('Select at least one day')).not.toBeInTheDocument()
    expect(screen.getByText(/No day chosen, so it's a flexible day — once a week/)).toBeInTheDocument()
  })

  it('all seven days, every week, says it is the same as Daily', () => {
    show({ type: 'weekly', days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] })
    expect(screen.getByText(/the same as Daily/)).toBeInTheDocument()
    expect(screen.queryByText(/flexible day/)).not.toBeInTheDocument()
  })

  // Every other week on all seven days is NOT daily.
  it('all seven days every two weeks does not claim to be Daily', () => {
    show({ type: 'weekly', days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], interval: 2, start_date: '2026-09-20' })
    expect(screen.queryByText(/the same as Daily/)).not.toBeInTheDocument()
  })

  it('Mon–Fri says "Hide daily" will sweep it, as isEverydayRoutine does', () => {
    show({ type: 'weekly', days: ['mon', 'tue', 'wed', 'thu', 'fri'] })
    expect(screen.getByText(/Every weekday, so it counts as daily/)).toBeInTheDocument()
  })

  it('an ordinary pick of days adds no note', () => {
    show({ type: 'weekly', days: ['tue', 'thu'] })
    expect(screen.queryByText(/flexible day|same as Daily|counts as daily/)).not.toBeInTheDocument()
  })

  it('Daily says each day is its own occurrence', () => {
    show({ type: 'daily' })
    expect(screen.getByText(/Each day has its own to tick off — doing it today doesn't settle tomorrow/)).toBeInTheDocument()
  })
})

// "Wash comforters" was meant as monthly on the first weekend and sat on
// Quarterly unnoticed (Scott, 2026-10-01): monthly can now be set by position,
// and the editor reads the rule back with its next date.
describe('RoutineScheduleEditor — monthly by position and the readback', () => {
  it('switching to "A weekend or weekday" emits a positioned rule with no day_of_month', () => {
    const onChange = vi.fn()
    render(<RoutineScheduleEditor recurrencePattern={{ type: 'monthly', day_of_month: 1 }} timeOfDay="" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'A weekend or weekday' }))
    expect(onChange).toHaveBeenLastCalledWith({
      recurrencePattern: { type: 'monthly', week_of_month: 1, day_of_week: 'weekend' },
      timeOfDay: '',
    })
  })

  it('choosing "last" + "Friday" emits that position', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <RoutineScheduleEditor recurrencePattern={{ type: 'monthly', week_of_month: 1, day_of_week: 'weekend' }} timeOfDay="" onChange={onChange} />,
    )
    fireEvent.change(screen.getByLabelText('Which one in the month'), { target: { value: '-1' } })
    expect(onChange).toHaveBeenLastCalledWith({
      recurrencePattern: { type: 'monthly', week_of_month: -1, day_of_week: 'weekend' },
      timeOfDay: '',
    })
    rerender(<RoutineScheduleEditor recurrencePattern={{ type: 'monthly', week_of_month: -1, day_of_week: 'weekend' }} timeOfDay="" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Weekend or day of the week'), { target: { value: 'fri' } })
    expect(onChange).toHaveBeenLastCalledWith({
      recurrencePattern: { type: 'monthly', week_of_month: -1, day_of_week: 'fri' },
      timeOfDay: '',
    })
  })

  it('back to "A date" drops the position', () => {
    const onChange = vi.fn()
    render(<RoutineScheduleEditor recurrencePattern={{ type: 'monthly', week_of_month: 2, day_of_week: 'tue' }} timeOfDay="" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'A date' }))
    expect(onChange).toHaveBeenLastCalledWith({ recurrencePattern: { type: 'monthly', day_of_month: 1 }, timeOfDay: '' })
  })

  it('reads the rule back with a next date', () => {
    show({ type: 'monthly', week_of_month: 1, day_of_week: 'weekend' })
    expect(screen.getByTestId('schedule-readback')).toHaveTextContent(/^Monthly, first weekend \(either day\) · next: Sat–Sun, /)
  })

  it('says plainly what Quarterly does', () => {
    show({ type: 'quarterly' })
    expect(screen.getByTestId('schedule-readback')).toHaveTextContent(/^Every 3 months on the 1st \(Jan, Apr, Jul, Oct\) · next: /)
  })
})
