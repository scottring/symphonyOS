import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { FromYear } from './FromYear'

const goals = [
  { id: 'g1', title: 'Run a 10k', here: ['Couch to 5k'] },
  { id: 'g2', title: 'Clear the garage', here: [] },
]
const someday = [{ id: 's1', title: 'Learn the banjo' }]

describe('FromYear — choose from the year, and Someday', () => {
  it('reads the year’s goals with what the season already holds under each; one with nothing can be brought in', async () => {
    const onPick = vi.fn(async () => true)
    render(<FromYear yearWord="2026" seasonWord="Fall" goals={goals} someday={someday} onPick={onPick} onBring={vi.fn()} />)
    const year = within(screen.getByRole('list', { name: '2026 goals' }))
    expect(within(year.getByRole('listitem', { name: 'Run a 10k' })).getByText('On Fall: Couch to 5k')).toBeInTheDocument()
    expect(year.queryByRole('button', { name: 'Fall: Run a 10k' })).toBeNull()
    await act(async () => { fireEvent.click(year.getByRole('button', { name: 'Fall: Clear the garage' })) })
    expect(onPick).toHaveBeenCalledWith(goals[1])
  })

  it('Someday folds to one line until opened; an item there can be brought into the season', async () => {
    const onBring = vi.fn(async () => true)
    render(<FromYear yearWord="2026" seasonWord="Fall" goals={goals} someday={someday} onPick={vi.fn()} onBring={onBring} />)
    expect(screen.queryByRole('list', { name: 'Someday' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Someday · 1' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Fall: Learn the banjo' })) })
    expect(onBring).toHaveBeenCalledWith(someday[0])
  })

  it('a pick that did not save says so on its row', async () => {
    render(<FromYear yearWord="2026" seasonWord="Fall" goals={goals} someday={[]} onPick={vi.fn(async () => false)} onBring={vi.fn()} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Fall: Clear the garage' })) })
    expect(within(screen.getByRole('listitem', { name: 'Clear the garage' })).getByRole('alert')).toHaveTextContent('Didn’t save. Try again.')
    expect(screen.queryByRole('button', { name: /^Someday/ })).toBeNull()
  })

  it('no year goals yet: says so, and says where they are written', () => {
    render(<FromYear yearWord="2026" seasonWord="Fall" goals={[]} someday={[]} onPick={vi.fn()} onBring={vi.fn()} />)
    expect(screen.getByText('No 2026 goals yet.')).toBeInTheDocument()
  })
})
