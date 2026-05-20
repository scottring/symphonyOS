import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WeekViewMobile } from './WeekViewMobile'

const baseProps = {
  tasks: [],
  events: [],
  routines: [],
  weekStart: new Date(2026, 4, 17),
  onSelectItem: vi.fn(),
}

describe('WeekViewMobile', () => {
  it('renders the 7 day headers (Sun..Sat) when no data', () => {
    render(<WeekViewMobile {...baseProps} />)
    expect(screen.getByText(/Sunday/i)).toBeInTheDocument()
    expect(screen.getByText(/Saturday/i)).toBeInTheDocument()
  })

  it('renders an unscheduled-tasks section when isAllDay tasks exist for the week', () => {
    const t = {
      id: 't1', title: 'Order shoes', completed: false,
      scheduledFor: new Date(2026, 4, 20), isAllDay: true,
    } as never
    render(<WeekViewMobile {...baseProps} tasks={[t]} />)
    expect(screen.getByText('Order shoes')).toBeInTheDocument()
    expect(screen.getByText(/unscheduled this week/i)).toBeInTheDocument()
  })

  it('does not render the unscheduled section when nothing is unscheduled', () => {
    render(<WeekViewMobile {...baseProps} />)
    expect(screen.queryByText(/unscheduled this week/i)).not.toBeInTheDocument()
  })
})
