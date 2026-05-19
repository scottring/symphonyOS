// src/components/schedule/StatsRow.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { StatsRow } from './StatsRow'

// Note: the AI-suggestions segment was removed in the Today redesign.

describe('StatsRow', () => {
  it('renders the two counts with singular/plural words', () => {
    // "tasks total" segment was intentionally removed in the Today redesign.
    // Only "done today" and "this week" segments remain.
    render(<StatsRow dueToday={2} doneToday={0} thisWeek={17} />)
    expect(screen.getByText('0 of 2 done today')).toBeInTheDocument()
    expect(screen.getByText('17 tasks this week')).toBeInTheDocument()
  })
  it('uses singular "task" for a count of 1', () => {
    render(<StatsRow dueToday={1} doneToday={0} thisWeek={1} />)
    expect(screen.getByText('0 of 1 done today')).toBeInTheDocument()
    expect(screen.getByText('1 task this week')).toBeInTheDocument()
  })
  it('renders a clarityTrigger node when provided', () => {
    // Clarity now comes via the clarityTrigger prop (e.g. ClarityIndicator).
    // StatsRow renders whatever ReactNode is passed; assert the sentinel text appears.
    render(<StatsRow dueToday={0} doneToday={0} thisWeek={0} clarityTrigger={<span>Needs attention</span>} />)
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
  })
  it('omits the clarity slot when clarityTrigger is not provided', () => {
    // When no clarityTrigger is passed the slot is absent entirely — no stale text.
    render(<StatsRow dueToday={0} doneToday={0} thisWeek={0} />)
    expect(screen.queryByText('Needs attention')).not.toBeInTheDocument()
    expect(screen.queryByText('No suggestions')).not.toBeInTheDocument()
  })
  it('shows completion as "N of M done today"', () => {
    render(<StatsRow dueToday={4} doneToday={1} thisWeek={2} />)
    expect(screen.getByText('1 of 4 done today')).toBeInTheDocument()
  })
})
