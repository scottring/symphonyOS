import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { FromYear } from './FromYear'

const goals = [
  { id: 'g1', title: 'Run a 10k' },
  { id: 'g2', title: 'Clear the garage' },
]
const someday = [{ id: 's1', title: 'Learn the banjo' }]

describe('FromYear — choose from the year, and Someday', () => {
  // Paper-style horizons (2026-11-04): the year is for reading; the season is
  // written in its own words.
  it('reads the year’s goals with no per-goal button and nothing said of what the season holds under them', () => {
    render(<FromYear yearWord="2026" seasonWord="Fall" goals={goals} someday={someday} onBring={vi.fn()} />)
    const year = within(screen.getByRole('list', { name: '2026 goals' }))
    expect(year.getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual(['Run a 10k', 'Clear the garage'])
    expect(year.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryByText(/On Fall/)).toBeNull()
  })

  it('Someday folds to one line until opened; an item there can be brought into the season', async () => {
    const onBring = vi.fn(async () => true)
    render(<FromYear yearWord="2026" seasonWord="Fall" goals={goals} someday={someday} onBring={onBring} />)
    expect(screen.queryByRole('list', { name: 'Someday' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Someday · 1' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Fall: Learn the banjo' })) })
    expect(onBring).toHaveBeenCalledWith(someday[0])
  })

  it('a Someday item that did not come in says so on its row', async () => {
    render(<FromYear yearWord="2026" seasonWord="Fall" goals={goals} someday={someday} onBring={vi.fn(async () => false)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Someday · 1' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Fall: Learn the banjo' })) })
    expect(within(screen.getByRole('listitem', { name: 'Learn the banjo' })).getByRole('alert')).toHaveTextContent('Didn’t save. Try again.')
  })

  it('no year goals yet: says so, and says where they are written', () => {
    render(<FromYear yearWord="2026" seasonWord="Fall" goals={[]} someday={[]} onBring={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /^Someday/ })).toBeNull()
    expect(screen.getByText('No 2026 goals yet.')).toBeInTheDocument()
  })
})
