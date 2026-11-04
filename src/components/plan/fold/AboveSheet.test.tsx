import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AboveSheet } from '@/components/plan/fold/AboveSheet'

const FOOT = 'For reading. Write November in its own words.'

describe('AboveSheet: the level above, for reading', () => {
  it('reads kicker, title, the open rows, how many are done, and the foot', () => {
    render(
      <AboveSheet
        kicker="Season · Sep 1 – Nov 30"
        title="Fall 2026"
        rows={[
          { id: 's1', title: 'Plan winter vacation' },
          { id: 's2', title: 'Chore system running for the kids' },
        ]}
        doneCount={3}
        foot={FOOT}
      />,
    )
    expect(screen.getByText('Season · Sep 1 – Nov 30')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Fall 2026' })).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Fall 2026' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Plan winter vacation',
      'Chore system running for the kids',
    ])
    expect(screen.getByText('3 done')).toBeInTheDocument()
    expect(screen.getByText(FOOT)).toBeInTheDocument()
  })

  it('has no controls of any kind', () => {
    const { container } = render(
      <AboveSheet kicker="Year" title="2026" rows={[{ id: 'g', title: 'Together' }]} doneCount={1} foot={FOOT} />,
    )
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(container.querySelectorAll('[draggable="true"]')).toHaveLength(0)
  })

  it('says nothing about done when none are', () => {
    render(<AboveSheet kicker="Year" title="2026" rows={[{ id: 'g', title: 'Together' }]} doneCount={0} foot={FOOT} />)
    expect(screen.queryByText(/\d+ done/)).toBeNull()
  })

  it('empty: says so, with no list', () => {
    render(
      <AboveSheet
        kicker="Last year"
        title="2025"
        rows={[]}
        doneCount={0}
        foot="For reading. Write 2026 in its own words."
        empty="Nothing left open from 2025."
      />,
    )
    expect(screen.getByText('Nothing left open from 2025.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.getByText('For reading. Write 2026 in its own words.')).toBeInTheDocument()
  })

  it('without onPick, renders no buttons even with rows', () => {
    render(<AboveSheet kicker="Year" title="2026" rows={[{ id: 'a', title: 'One' }, { id: 'b', title: 'Two' }]} doneCount={0} foot={FOOT} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})

// Today (Scott, 2026-11-04): the week sheet beside the day keeps its + and its
// drag onto the day, because week and day share items.
describe('AboveSheet with onPick: the week beside the day', () => {
  const rows = [
    { id: 'a', title: 'Book the cabin' },
    { id: 'b', title: 'Call the bank' },
  ]

  it('gives each row a "+" named "Plan {title} for today" that picks it', () => {
    const onPick = vi.fn()
    render(<AboveSheet kicker="Week · Oct 31 – Nov 6" title="Week 45" rows={rows} doneCount={0} foot="Pick three to five for today." onPick={onPick} />)
    const plus = screen.getByRole('button', { name: 'Plan Book the cabin for today' })
    expect(plus).toHaveTextContent('+')
    expect(screen.getByRole('button', { name: 'Plan Call the bank for today' })).toBeInTheDocument()
    fireEvent.click(plus)
    expect(onPick).toHaveBeenCalledWith('a')
    expect(screen.getByText('Pick three to five for today.')).toBeInTheDocument()
  })

  it('names the + for another day when asked', () => {
    render(<AboveSheet kicker="Week" title="Week 45" rows={rows} doneCount={0} foot="f" onPick={vi.fn()} pickLabel={(t) => `Plan ${t} for Friday`} />)
    expect(screen.getByRole('button', { name: 'Plan Book the cabin for Friday' })).toBeInTheDocument()
  })

  it('rows drag onto the day, and a title tap opens the task', () => {
    const onDragRow = vi.fn()
    const onOpen = vi.fn()
    render(<AboveSheet kicker="Week" title="Week 45" rows={rows} doneCount={0} foot="f" onPick={vi.fn()} onDragRow={onDragRow} onOpen={onOpen} />)
    const row = screen.getByText('Book the cabin').closest('li')!
    expect(row).toHaveAttribute('draggable', 'true')
    fireEvent.dragStart(row, { dataTransfer: { setData: vi.fn(), effectAllowed: '' } })
    expect(onDragRow).toHaveBeenCalledWith('a', expect.anything())
    fireEvent.click(screen.getByRole('button', { name: 'Book the cabin' }))
    expect(onOpen).toHaveBeenCalledWith('a')
  })
})
