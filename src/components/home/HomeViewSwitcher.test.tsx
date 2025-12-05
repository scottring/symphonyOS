import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { HomeViewSwitcher } from './HomeViewSwitcher'

describe('HomeViewSwitcher', () => {
  it('renders all three view options as icon buttons', () => {
    const onViewChange = vi.fn()
    render(<HomeViewSwitcher currentView="today" onViewChange={onViewChange} />)

    // Three icon buttons with aria-labels
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Today + Context' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Week' })).toBeInTheDocument()
  })

  it('highlights the currently selected view', () => {
    const onViewChange = vi.fn()
    const { rerender } = render(
      <HomeViewSwitcher currentView="today" onViewChange={onViewChange} />
    )

    // Today should have active styling (bg-white shadow-sm)
    const todayButton = screen.getByRole('button', { name: 'Today' })
    expect(todayButton).toHaveClass('bg-white')

    // Rerender with week view active
    rerender(<HomeViewSwitcher currentView="week" onViewChange={onViewChange} />)
    const weekButton = screen.getByRole('button', { name: 'Week' })
    expect(weekButton).toHaveClass('bg-white')
  })

  it('calls onViewChange with "today" when Today icon is clicked', async () => {
    const onViewChange = vi.fn()
    const { user } = render(
      <HomeViewSwitcher currentView="week" onViewChange={onViewChange} />
    )

    await user.click(screen.getByRole('button', { name: 'Today' }))

    expect(onViewChange).toHaveBeenCalledWith('today')
  })

  it('calls onViewChange with "today-context" when Today+Context icon is clicked', async () => {
    const onViewChange = vi.fn()
    const { user } = render(
      <HomeViewSwitcher currentView="today" onViewChange={onViewChange} />
    )

    await user.click(screen.getByRole('button', { name: 'Today + Context' }))

    expect(onViewChange).toHaveBeenCalledWith('today-context')
  })

  it('calls onViewChange with "week" when Week icon is clicked', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Today' }))

    // Should still call onViewChange even if same view
    expect(onViewChange).toHaveBeenCalledWith('today')
  })
})
