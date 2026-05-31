import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WeekSummaryRow } from './WeekSummaryRow'

// The groceries card is gated on the meals-paused flag. Mock it as a live
// getter so individual tests can flip it (default: meals on).
const mealsFlag = vi.hoisted(() => ({ on: true }))
vi.mock('@/lib/mealsVisibility', () => ({
  get SHOW_PLANNED_MEALS_ON_TIMELINE() {
    return mealsFlag.on
  },
}))

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

  it('hides the groceries card while planned meals are paused, even with items missing', () => {
    mealsFlag.on = false
    try {
      render(<WeekSummaryRow {...baseProps} groceries={{ missingCount: 5 }} />)
      expect(screen.queryByText(/items missing/i)).not.toBeInTheDocument()
    } finally {
      mealsFlag.on = true
    }
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
