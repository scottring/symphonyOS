import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
})
