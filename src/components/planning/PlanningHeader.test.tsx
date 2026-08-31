import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { PlanningHeader } from './PlanningHeader'

function props(overrides = {}) {
  return {
    dateRange: [new Date(2026, 7, 2), new Date(2026, 7, 8)],
    onClose: vi.fn(),
    onAddDay: vi.fn(),
    onRemoveDay: vi.fn(),
    onDateChange: vi.fn(),
    ...overrides,
  }
}

describe('PlanningHeader close affordances', () => {
  // The X and Done are one concept. Done was ungated, so an embedded host
  // passing `onClose={() => {}}` rendered a primary-styled button that did
  // nothing — on /week, every time.
  it('offers Done and the X where closing means something', () => {
    render(<PlanningHeader {...props({ showClose: true })} />)
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
    expect(screen.getByLabelText('Close planning session')).toBeInTheDocument()
  })

  it('offers neither when the surface cannot be closed', () => {
    render(<PlanningHeader {...props({ showClose: false })} />)
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Close planning session')).not.toBeInTheDocument()
  })

  it('keeps the date range readable either way', () => {
    render(<PlanningHeader {...props({ showClose: false })} />)
    expect(screen.getByText(/Aug 2/)).toBeInTheDocument()
  })
})

describe('PlanningHeader routines toggle', () => {
  it('shows a labeled Routines switch reflecting hidden state', () => {
    const onToggle = vi.fn()
    render(<PlanningHeader {...props({ hideRoutines: true, onToggleRoutines: onToggle })} />)
    const toggle = screen.getByRole('switch', { name: 'Routines' })
    expect(toggle).toHaveAttribute('aria-checked', 'false') // hidden → off
    toggle.click()
    expect(onToggle).toHaveBeenCalled()
  })
})
