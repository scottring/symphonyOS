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
  it('preserves cleanup of existing sample data', async () => {
    const clear = vi.fn()
    const { user } = render(<FirstWeekCard steps={[]} onHide={vi.fn()} onSamplePage={vi.fn()} onClearSample={clear} />)
    await user.click(screen.getByRole('button', { name: 'Clear sample' }))
    expect(clear).toHaveBeenCalledOnce()
  })
})
