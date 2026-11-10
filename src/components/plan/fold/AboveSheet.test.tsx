import { createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AboveSheet, JUST_DONE_MS, type RowStatusMenu } from '@/components/plan/fold/AboveSheet'

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

  it('draws rowTools on each row, before the +', () => {
    render(<AboveSheet kicker="Week" title="This week" rows={[{ id: 'a', title: 'Call KKI' }]} doneCount={0} foot={FOOT} onOpen={vi.fn()} onPick={vi.fn()}
      rowTools={(id) => <button type="button">{`Tools ${id}`}</button>} />)
    const tools = screen.getByRole('button', { name: 'Tools a' })
    expect(tools.compareDocumentPosition(screen.getByRole('button', { name: 'Plan Call KKI for today' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows a row in progress on its circle, adding no words', () => {
    render(<AboveSheet kicker="Week" title="This week" rows={[{ id: 'a', title: 'Call KKI', status: 'started' }]} doneCount={0} foot={FOOT} onOpen={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Mark Call KKI complete' })).toHaveClass('is-started')
    expect(screen.getByRole('listitem')).toHaveTextContent(/^In progressCall KKI$/)
  })

  it('shows who a row is waiting on under its title', () => {
    render(<AboveSheet kicker="Week" title="This week" rows={[{ id: 'a', title: 'Call KKI', status: 'waiting', note: 'Waiting on Iris' }]} doneCount={0} foot={FOOT} onOpen={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Mark Call KKI complete' })).toHaveClass('is-waiting')
    expect(screen.getByText('Waiting on Iris')).toHaveClass('above-sheet-row-note')
  })

  it('shows only the next step of a row in progress, and ticks it', () => {
    const onNextStep = vi.fn()
    render(<AboveSheet kicker="Week" title="This week" rows={[{ id: 'a', title: 'Call KKI', status: 'started', fill: 25, nextStep: 'Find the number' }]} doneCount={0} foot={FOOT} onOpen={vi.fn()} onComplete={vi.fn()} onNextStep={onNextStep} />)
    expect(screen.getByText('Find the number')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark Call KKI complete' }).style.getPropertyValue('--fill')).toBe('25%')
    fireEvent.click(screen.getByRole('button', { name: 'Mark Find the number done' }))
    expect(onNextStep).toHaveBeenCalledWith('a')
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

    // Scott, 2026-11-10: "there's no undo" — the strip's Undo was far from the row.
    it('keeps a ticked row in place, crossed out, with its own Undo', () => {
      vi.useFakeTimers()
      try {
        const onReopen = vi.fn()
        const { rerender } = render(<AboveSheet kicker="Week" title="This week" rows={rows} doneCount={0} foot={FOOT} onOpen={vi.fn()} onComplete={vi.fn()} onReopen={onReopen} />)
        fireEvent.click(screen.getByRole('button', { name: 'Mark Call KKI complete' }))
        // The data catches up and the row leaves the open list; it still shows, done.
        rerender(<AboveSheet kicker="Week" title="This week" rows={rows.slice(1)} doneCount={1} foot={FOOT} onOpen={vi.fn()} onComplete={vi.fn()} onReopen={onReopen} />)
        const items = screen.getAllByRole('listitem')
        expect(items[0]).toHaveTextContent('Call KKI')
        expect(items[0]).toHaveTextContent('Done · Undo')
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
        expect(onReopen).toHaveBeenCalledWith('a')
        expect(screen.queryByText('Done ·', { exact: false })).toBeNull()
      } finally { vi.useRealTimers() }
    })

    it('lets the ticked row go after a few seconds', () => {
      vi.useFakeTimers()
      try {
        const { rerender } = render(<AboveSheet kicker="Week" title="This week" rows={rows} doneCount={0} foot={FOOT} onOpen={vi.fn()} onComplete={vi.fn()} onReopen={vi.fn()} />)
        fireEvent.click(screen.getByRole('button', { name: 'Mark Call KKI complete' }))
        rerender(<AboveSheet kicker="Week" title="This week" rows={rows.slice(1)} doneCount={1} foot={FOOT} onOpen={vi.fn()} onComplete={vi.fn()} onReopen={vi.fn()} />)
        act(() => { vi.advanceTimersByTime(JUST_DONE_MS) })
        expect(screen.getAllByRole('listitem')).toHaveLength(1)
        expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
      } finally { vi.useRealTimers() }
    })

    it('opens "N done" to the finished tasks, and a check puts one back', () => {
      const onReopen = vi.fn()
      render(<AboveSheet kicker="Week" title="This week" rows={rows} doneCount={1} doneRows={[{ id: 'z', title: 'Pay FFG' }]} foot={FOOT} onOpen={vi.fn()} onComplete={vi.fn()} onReopen={onReopen} />)
      expect(screen.queryByText('Pay FFG')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: '1 done' }))
      expect(screen.getByRole('list', { name: 'Done' })).toHaveTextContent('Pay FFG')
      fireEvent.click(screen.getByRole('button', { name: 'Mark Pay FFG not done' }))
      expect(onReopen).toHaveBeenCalledWith('z')
    })

    it('opens the row’s status menu from its status line', () => {
      const seen: Record<string, RowStatusMenu> = {}
      const rowTools = (id: string, menu: RowStatusMenu) => { seen[id] = menu; return menu.open ? <span>menu for {id}</span> : null }
      render(<AboveSheet kicker="Week" title="This week" rows={[{ id: 'a', title: 'Call KKI', status: 'waiting', note: 'Waiting on KKI' }]} doneCount={0} foot={FOOT} onOpen={vi.fn()} rowTools={rowTools} />)
      fireEvent.click(screen.getByRole('button', { name: 'Waiting on KKI' }))
      expect(screen.getByText('menu for a')).toBeInTheDocument()
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

    it('a row dropped above the list, on the heading, goes to the very top', () => {
      const onReorder = vi.fn()
      sheet(5, { onReorder, onOpen: vi.fn(), rowsHeading: 'Sometime this week' })
      const list = screen.getByRole('list', { name: 'This week' })
      within(list).getAllByRole('listitem').forEach((li, i) => { li.getBoundingClientRect = () => ({ top: 100 + i * 10, bottom: 110 + i * 10, height: 10, left: 0, right: 0, width: 0, x: 0, y: 100 + i * 10, toJSON: () => ({}) }) })
      const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
      fireEvent.dragStart(within(list).getAllByRole('listitem')[2], { dataTransfer })
      const heading = screen.getByRole('heading', { level: 3, name: 'Sometime this week' })
      const at = (ev: Event) => { Object.defineProperty(ev, 'clientY', { value: 60 }); return ev }
      const over = at(createEvent.dragOver(heading, { dataTransfer }))
      fireEvent(heading, over)
      expect(over.defaultPrevented).toBe(true)
      fireEvent(heading, at(createEvent.drop(heading, { dataTransfer })))
      expect(onReorder).toHaveBeenCalledWith('r2', 0)
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
