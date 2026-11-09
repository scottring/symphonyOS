import { createEvent, fireEvent, render, screen, within } from '@testing-library/react'
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

  describe('a check on Today’s week sheet', () => {
    const rows = [{ id: 'a', title: 'Call KKI' }, { id: 'b', title: 'Book transport' }]

    it('marks a row done', () => {
      const onComplete = vi.fn()
      render(<AboveSheet kicker="Week" title="This week" rows={rows} doneCount={0} foot={FOOT} onOpen={vi.fn()} onComplete={onComplete} />)
      fireEvent.click(screen.getByRole('button', { name: 'Mark Call KKI complete' }))
      expect(onComplete).toHaveBeenCalledWith('a')
    })

    it('comes before the title', () => {
      render(<AboveSheet kicker="Week" title="This week" rows={rows} doneCount={0} foot={FOOT} onOpen={vi.fn()} onComplete={vi.fn()} />)
      const check = screen.getByRole('button', { name: 'Mark Call KKI complete' })
      expect(check.compareDocumentPosition(screen.getByRole('button', { name: 'Call KKI' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('is absent without onComplete', () => {
      render(<AboveSheet kicker="Week" title="This week" rows={rows} doneCount={0} foot={FOOT} onOpen={vi.fn()} />)
      expect(screen.queryByRole('button', { name: /complete$/ })).toBeNull()
    })
  })

  describe('a long list shows only its first rows', () => {
    const rows = Array.from({ length: 19 }, (_, i) => ({ id: `r${i}`, title: `Task ${i + 1}` }))
    const titles = () => within(screen.getByRole('list', { name: 'This week' })).getAllByRole('listitem').map((li) => li.textContent)
    const sheet = (n = rows.length, extra = {}) => render(<AboveSheet kicker="Week" title="This week" rows={rows.slice(0, n)} doneCount={0} foot={FOOT} shortList={5} {...extra} />)

    it('shows the first 5 in order, and says how many more there are', () => {
      sheet()
      expect(titles()).toEqual(['Task 1', 'Task 2', 'Task 3', 'Task 4', 'Task 5'])
      expect(screen.getByRole('button', { name: '14 more' })).toHaveAttribute('aria-expanded', 'false')
    })

    it('opens in place, and folds back', () => {
      sheet()
      fireEvent.click(screen.getByRole('button', { name: '14 more' }))
      expect(titles()).toHaveLength(19)
      expect(titles()[18]).toBe('Task 19')
      fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }))
      expect(titles()).toHaveLength(5)
    })

    it('does not fold away a single row', () => {
      sheet(6)
      expect(titles()).toHaveLength(6)
      expect(screen.queryByRole('button', { name: /more$/ })).toBeNull()
    })

    it('folds nothing without shortList', () => {
      render(<AboveSheet kicker="Week" title="This week" rows={rows} doneCount={0} foot={FOOT} />)
      expect(titles()).toHaveLength(19)
    })

    it('a row moved in the opened list drops at its place in the whole list', () => {
      const onReorder = vi.fn()
      sheet(19, { onReorder, onOpen: vi.fn() })
      fireEvent.click(screen.getByRole('button', { name: '14 more' }))
      const list = screen.getByRole('list', { name: 'This week' })
      const lis = within(list).getAllByRole('listitem')
      lis.forEach((li, i) => { li.getBoundingClientRect = () => ({ top: i * 10, bottom: i * 10 + 10, height: 10, left: 0, right: 0, width: 0, x: 0, y: i * 10, toJSON: () => ({}) }) })
      const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
      fireEvent.dragStart(lis[0], { dataTransfer })
      const at = (ev: Event) => { Object.defineProperty(ev, 'clientY', { value: 121 }); return ev }
      fireEvent(list, at(createEvent.dragOver(list, { dataTransfer })))
      fireEvent(list, at(createEvent.drop(list, { dataTransfer })))
      expect(onReorder).toHaveBeenCalledWith('r0', 12)
    })
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

// Final review (2026-11-04): on the iPad the week sheet's + was a 28px
// target. jsdom lays nothing out and reads no media queries, so the rule is
// read from the stylesheet: on a coarse pointer the press reaches 44px.
describe('the + on a coarse pointer', () => {
  it('takes a press of at least 44px', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync('src/components/plan/fold/sheet.css', 'utf8')
    const base = /\.above-sheet-pick \{[^}]*?width: (\d+)px; height: (\d+)px;/.exec(css)
    expect(base).not.toBeNull()
    const coarse = /@media \(pointer: coarse\) \{\s*\.above-sheet-pick::before \{([^}]*)\}/.exec(css)
    expect(coarse).not.toBeNull()
    const inset = Number(/inset: -(\d+)px/.exec(coarse![1])?.[1])
    expect(coarse![1]).toContain('position: absolute')
    expect(Number(base![1]) + 2 * inset).toBeGreaterThanOrEqual(44)
    expect(Number(base![2]) + 2 * inset).toBeGreaterThanOrEqual(44)
    expect(css).toMatch(/\.above-sheet-pick \{ position: relative; \}/)
  })
})
