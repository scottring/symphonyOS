import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
