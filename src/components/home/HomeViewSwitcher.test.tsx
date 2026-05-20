import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { HomeViewSwitcher } from './HomeViewSwitcher'

describe('HomeViewSwitcher', () => {
  it('renders Day, Week, and Month buttons in a segmented control', () => {
    const onViewChange = vi.fn()
    render(<HomeViewSwitcher currentView="today" onViewChange={onViewChange} />)

    // Four text buttons: Day, Workweek, Week, Month
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Day' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Workweek' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Week' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Month' })).toBeInTheDocument()
  })

  it('highlights the currently selected view with primary color', () => {
    const onViewChange = vi.fn()
    const { rerender } = render(
      <HomeViewSwitcher currentView="today" onViewChange={onViewChange} />
    )

    // Day should have active styling (bg-primary-500)
    const dayButton = screen.getByRole('button', { name: 'Day' })
    expect(dayButton).toHaveClass('bg-primary-500')

    // Rerender with week view active
    rerender(<HomeViewSwitcher currentView="week" onViewChange={onViewChange} />)
    const weekButton = screen.getByRole('button', { name: 'Week' })
    expect(weekButton).toHaveClass('bg-primary-500')
  })

  it('calls onViewChange with "today" when Day is clicked', async () => {
    const onViewChange = vi.fn()
    const { user } = render(
      <HomeViewSwitcher currentView="week" onViewChange={onViewChange} />
    )

    await user.click(screen.getByRole('button', { name: 'Day' }))

    expect(onViewChange).toHaveBeenCalledWith('today')
  })

  it('calls onViewChange with "week" when Week is clicked', async () => {
    const onViewChange = vi.fn()
    const { user } = render(
      <HomeViewSwitcher currentView="today" onViewChange={onViewChange} />
    )

    await user.click(screen.getByRole('button', { name: 'Week' }))

    expect(onViewChange).toHaveBeenCalledWith('week')
  })

  it('does not prevent clicking the already-active view', async () => {
    const onViewChange = vi.fn()
    const { user } = render(
      <HomeViewSwitcher currentView="today" onViewChange={onViewChange} />
    )

    await user.click(screen.getByRole('button', { name: 'Day' }))

    // Should still call onViewChange even if same view
    expect(onViewChange).toHaveBeenCalledWith('today')
  })

  it('renders Workweek option and fires onChange with workweek', async () => {
    const onViewChange = vi.fn()
    const { user } = render(
      <HomeViewSwitcher currentView="today" onViewChange={onViewChange} />
    )
    const btn = screen.getByRole('button', { name: 'Workweek' })
    await user.click(btn)
    expect(onViewChange).toHaveBeenCalledWith('workweek')
  })
})
