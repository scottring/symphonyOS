// src/components/schedule/StatsRow.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { StatsRow } from './StatsRow'

describe('StatsRow', () => {
  it('renders the three counts with singular/plural words', () => {
    render(<StatsRow dueToday={2} doneToday={0} thisWeek={17} total={47} clarityLabel="Needs attention" aiAvailable />)
    expect(screen.getByText('0 of 2 done today')).toBeInTheDocument()
    expect(screen.getByText('17 tasks this week')).toBeInTheDocument()
    expect(screen.getByText('47 tasks total')).toBeInTheDocument()
  })
  it('uses singular "task" for a count of 1', () => {
    render(<StatsRow dueToday={1} doneToday={0} thisWeek={1} total={1} clarityLabel="Good" aiAvailable={false} />)
    expect(screen.getByText('0 of 1 done today')).toBeInTheDocument()
    expect(screen.getByText('1 task this week')).toBeInTheDocument()
  })
  it('shows clarity label and AI state', () => {
    render(<StatsRow dueToday={0} doneToday={0} thisWeek={0} total={0} clarityLabel="Needs attention" aiAvailable />)
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText('Suggestions available')).toBeInTheDocument()
  })
  it('shows the idle AI state when none available', () => {
    render(<StatsRow dueToday={0} doneToday={0} thisWeek={0} total={0} clarityLabel="Good" aiAvailable={false} />)
    expect(screen.getByText('No suggestions')).toBeInTheDocument()
  })
  it('shows completion as "N of M done today"', () => {
    render(<StatsRow dueToday={4} doneToday={1} thisWeek={2} total={9} clarityLabel="Good" aiAvailable={false} />)
    expect(screen.getByText('1 of 4 done today')).toBeInTheDocument()
  })
})
