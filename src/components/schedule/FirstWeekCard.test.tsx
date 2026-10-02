import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { FirstWeekCard } from './FirstWeekCard'

describe('optional onboarding', () => {
  it('offers immediate work without requiring annual planning or family setup', async () => {
    const open = vi.fn()
    window.addEventListener('symphony:add-today', open)
    const { user } = render(<FirstWeekCard steps={[]} onHide={vi.fn()} onSamplePage={vi.fn()} />)
    expect(screen.queryByText('Your first week')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add something for today' }))
    expect(open).toHaveBeenCalledOnce()
    expect(screen.getByRole('link', { name: 'Week' })).toHaveAttribute('href', '/week')
    window.removeEventListener('symphony:add-today', open)
  })
  it('lets goal-first users choose a horizon and explore independently', async () => {
    const hide = vi.fn()
    const { user } = render(<FirstWeekCard steps={[]} onHide={hide} onSamplePage={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Start with a goal' }))
    for (const level of ['Month', 'Season', 'Year']) expect(screen.getByRole('link', { name: level })).toHaveAttribute('href', `/${level.toLowerCase()}`)
    await user.click(screen.getByRole('button', { name: 'Explore on my own' }))
    expect(hide).toHaveBeenCalledOnce()
  })
  // Walkthrough 2026-10-02 (#2): "more graphical / push-buttony / inviting".
  it('draws the three ways in as tiles, each with a one-line promise; today is the filled one', () => {
    render(<FirstWeekCard steps={[]} onHide={vi.fn()} onSamplePage={vi.fn()} />)
    const today = screen.getByRole('button', { name: 'Add something for today' })
    expect(today).toHaveAccessibleDescription('Write it down and do it today.')
    expect(today).toHaveClass('bg-primary-600')
    expect(today.querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Start with a goal' })).toHaveAccessibleDescription('Name what you want this year or season to hold.')
    expect(screen.getByRole('button', { name: 'Explore on my own' })).toHaveAccessibleDescription('Hide this and look around.')
    expect(screen.getByRole('button', { name: 'Explore on my own' })).not.toHaveClass('bg-primary-600')
    // Stacked on a phone, a row of three from the small breakpoint up.
    expect(today.parentElement).toHaveClass('grid-cols-1', 'sm:grid-cols-3')
    expect(screen.getByRole('link', { name: 'Plan with guidance →' })).toHaveAttribute('href', '/start')
  })
  it('preserves cleanup of existing sample data', async () => {
    const clear = vi.fn()
    const { user } = render(<FirstWeekCard steps={[]} onHide={vi.fn()} onSamplePage={vi.fn()} onClearSample={clear} />)
    await user.click(screen.getByRole('button', { name: 'Clear sample' }))
    expect(clear).toHaveBeenCalledOnce()
  })
})
