import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { PlanningHeader } from './PlanningHeader'

function props(overrides = {}) {
  return {
    dateRange: [new Date(2026, 7, 2), new Date(2026, 7, 8)],
    onClose: vi.fn(),
    onAddDay: vi.fn(),
    onRemoveDay: vi.fn(),
    onRangeChange: vi.fn(),
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

describe('PlanningHeader range picker', () => {
  // The custom "span" used to be a saved range with its own pool on Today —
  // a third place to file work that Week already held. The range belongs
  // here, on the surface that lays the days out (Scott, 2026-09-05).
  it('opens presets and both ends of the range', async () => {
    const user = userEvent.setup()
    render(<PlanningHeader {...props()} />)
    await user.click(screen.getByRole('button', { name: /Aug 2/ }))
    expect(screen.getByRole('button', { name: 'Weekend' })).toBeInTheDocument()
    expect(screen.getByLabelText('Start')).toBeInTheDocument()
    expect(screen.getByLabelText('End')).toBeInTheDocument()
  })

  it('a preset hands back the whole range, not just a start', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 8, 2)) // Wednesday Sep 2
    const user = userEvent.setup()
    const onRangeChange = vi.fn()
    render(<PlanningHeader {...props({ onRangeChange })} />)
    await user.click(screen.getByRole('button', { name: /Aug 2/ }))
    await user.click(screen.getByRole('button', { name: 'Weekend' }))
    const range = onRangeChange.mock.calls[0][0] as Date[]
    expect(range.map((d) => d.getDate())).toEqual([5, 6])
    vi.useRealTimers()
  })

  // Naming an end is the whole point: a Sat–Mon weekend in one edit, instead
  // of clicking + twice and hoping the columns land right.
  it('a new end date rebuilds the range from the existing start', () => {
    const onRangeChange = vi.fn()
    render(<PlanningHeader {...props({ dateRange: [new Date(2026, 8, 5)], onRangeChange })} />)
    fireEvent.click(screen.getByRole('button', { name: /Sep 5/ }))
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '2026-09-07' } })
    const range = onRangeChange.mock.calls[0][0] as Date[]
    expect(range.map((d) => d.getDate())).toEqual([5, 6, 7])
  })

  it('a new start date carries the current length along', () => {
    const onRangeChange = vi.fn()
    render(<PlanningHeader {...props({
      dateRange: [new Date(2026, 8, 5), new Date(2026, 8, 6)],
      onRangeChange,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: /Sep 5/ }))
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-09-10' } })
    const range = onRangeChange.mock.calls[0][0] as Date[]
    expect(range.map((d) => d.getDate())).toEqual([10, 11])
  })
})
