// src/components/schedule/StatsRow.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { StatsRow } from './StatsRow'

// StatsRow is now a controls-only strip: the numeric counts (remaining today,
// this week) moved into the unified TodayProgress header. StatsRow carries only
// the interactive triggers + end-controls.

describe('StatsRow', () => {
  it('renders the controls strip container', () => {
    render(<StatsRow dueToday={2} doneToday={0} thisWeek={17} />)
    expect(screen.getByTestId('today-controls')).toBeInTheDocument()
  })

  it('no longer renders the raw remaining/this-week counts (they live in the header now)', () => {
    render(<StatsRow dueToday={2} doneToday={0} thisWeek={17} />)
    expect(screen.queryByTitle(/remaining today/i)).not.toBeInTheDocument()
    expect(screen.queryByText('17 tasks this week')).not.toBeInTheDocument()
  })

  it('renders the clarityTrigger when provided', () => {
    render(<StatsRow dueToday={1} doneToday={0} thisWeek={1} clarityTrigger={<span>Clarity Good</span>} />)
    expect(screen.getByText('Clarity Good')).toBeInTheDocument()
  })

  it('renders the weekTrigger, emailTrigger and endControls when provided', () => {
    render(
      <StatsRow
        dueToday={1}
        doneToday={0}
        thisWeek={1}
        weekTrigger={<span>This Week</span>}
        emailTrigger={<span>4 from email</span>}
        endControls={<button>Show daily</button>}
      />,
    )
    expect(screen.getByText('This Week')).toBeInTheDocument()
    expect(screen.getByText('4 from email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show daily' })).toBeInTheDocument()
  })
})
