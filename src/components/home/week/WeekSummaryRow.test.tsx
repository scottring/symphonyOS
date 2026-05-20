import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WeekSummaryRow } from './WeekSummaryRow'

describe('WeekSummaryRow', () => {
  const baseProps = {
    familyDinner: { nights: 0, avatars: [] },
    groceries: { missingCount: 0 },
    prepAhead: null,
  }

  it('renders the dinner card with night count when nights > 0', () => {
    render(<WeekSummaryRow {...baseProps} familyDinner={{ nights: 4, avatars: [] }} />)
    expect(screen.getByText(/4 nights this week/i)).toBeInTheDocument()
  })

  it('hides the dinner card when nights = 0', () => {
    render(<WeekSummaryRow {...baseProps} />)
    expect(screen.queryByText(/nights this week/i)).not.toBeInTheDocument()
  })

  it('renders avatars on the dinner card', () => {
    render(<WeekSummaryRow {...baseProps} familyDinner={{
      nights: 4,
      avatars: [
        { id: 'a', initials: 'SK', color: 'blue' },
        { id: 'b', initials: 'IR', color: 'purple' },
      ],
    }} />)
    expect(screen.getByText('SK')).toBeInTheDocument()
    expect(screen.getByText('IR')).toBeInTheDocument()
  })

  it('renders the groceries card when items missing', () => {
    render(<WeekSummaryRow {...baseProps} groceries={{ missingCount: 2 }} />)
    expect(screen.getByText(/2 items missing/i)).toBeInTheDocument()
  })

  it('hides the groceries card when missingCount = 0', () => {
    render(<WeekSummaryRow {...baseProps} />)
    expect(screen.queryByText(/items missing/i)).not.toBeInTheDocument()
  })

  it('renders the prep-ahead card when a recipe is suggested', () => {
    render(<WeekSummaryRow {...baseProps} prepAhead={{ recipeName: 'Lentil stew' }} />)
    expect(screen.getByText(/prep lentil stew tonight/i)).toBeInTheDocument()
  })

  it('hides the prep-ahead card when prepAhead is null', () => {
    render(<WeekSummaryRow {...baseProps} />)
    expect(screen.queryByText(/prep .* tonight/i)).not.toBeInTheDocument()
  })

  it('renders nothing visible when all cards hide', () => {
    const { container } = render(<WeekSummaryRow {...baseProps} />)
    expect(container.querySelector('section')).toBeNull()
  })
})
