// src/components/schedule/StatsRow.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { StatsRow } from './StatsRow'

// Note: the AI-suggestions segment was removed in the Today redesign.

describe('StatsRow four-count Today layout', () => {
  it('renders events / focus / routines / from email counts when eventsCount is provided', () => {
    render(<StatsRow dueToday={0} doneToday={0} thisWeek={0} eventsCount={11} focusCount={3} routinesCount={8} emailCount={2} />)
    expect(screen.getByText('11')).toBeInTheDocument()
    expect(screen.getByText(/events/i)).toBeInTheDocument()
    expect(screen.getByText(/focus items/i)).toBeInTheDocument()
    expect(screen.getByText(/routines/i)).toBeInTheDocument()
    expect(screen.getByText(/from email/i)).toBeInTheDocument()
  })
})

describe('StatsRow', () => {
  it('shows tasks remaining today as a count, with a descriptive tooltip', () => {
    // The "N of M done today" text was replaced by a checklist icon + remaining count.
    render(<StatsRow dueToday={2} doneToday={0} thisWeek={17} />)
    expect(screen.getByTitle('2 tasks remaining today (0 of 2 done)')).toBeInTheDocument()
    expect(screen.getByText('17 tasks this week')).toBeInTheDocument()
  })
  it('uses singular "task" in the remaining tooltip for a count of 1', () => {
    render(<StatsRow dueToday={1} doneToday={0} thisWeek={1} />)
    expect(screen.getByTitle('1 task remaining today (0 of 1 done)')).toBeInTheDocument()
    expect(screen.getByText('1 task this week')).toBeInTheDocument()
  })
  it('subtracts done from due to compute remaining', () => {
    render(<StatsRow dueToday={4} doneToday={1} thisWeek={2} />)
    expect(screen.getByTitle('3 tasks remaining today (1 of 4 done)')).toBeInTheDocument()
  })
  it('renders the clarityTrigger when provided', () => {
    render(
      <StatsRow dueToday={1} doneToday={0} thisWeek={1} clarityTrigger={<span>Clarity Good</span>} />,
    )
    expect(screen.getByText('Clarity Good')).toBeInTheDocument()
  })
})
