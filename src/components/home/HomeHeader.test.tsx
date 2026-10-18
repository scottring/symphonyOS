import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { HomeHeader } from './HomeHeader'
import { ReferenceListsProvider } from '@/components/reference/ReferenceListsContext'
import { PageHelpContext } from '@/components/explain/PageHelp'
import { EXPLAIN_LABEL } from '@/lib/explain/pageGuides'

vi.mock('./HomeChromeControls', () => ({ HomeChromeControls: () => null }))

const ymd = (x: Date) => `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`

// The shorter runs live in a menu hung off the dates (calm pass 2: the
// title row is "‹ {range} ›", no WEEK eyebrow), not in a row of buttons
// under them.
const rangeButton = () => document.querySelector<HTMLElement>('[aria-controls="week-range-menu"]')!
function pick(name: string) {
  fireEvent.click(rangeButton())
  fireEvent.click(screen.getByRole('menuitem', { name }))
}
// The run's own name, beside the dates in the title row.
const titleRow = () => screen.getByTestId('masthead-title-nav')

function renderWeek(over: Partial<React.ComponentProps<typeof HomeHeader>> = {}) {
  const onWeekChange = vi.fn()
  const onRangeChange = vi.fn()
  const baseProps: React.ComponentProps<typeof HomeHeader> = {
    currentView: 'week',
    onViewChange: () => {},
    viewedDate: new Date(2026, 8, 9),
    onDateChange: () => {},
    weekStart: new Date(2026, 8, 6),
    onWeekChange,
    rangeDays: 7,
    onRangeChange,
    monthStart: new Date(2026, 8, 1),
    onMonthChange: () => {},
    ...over,
  }
  const view = render(<ReferenceListsProvider userId="test"><HomeHeader {...baseProps} /></ReferenceListsProvider>)
  // Simulates what the real parent does: feed a picked/changed range's shape
  // back in as props, as if HomeView had stored it and re-rendered.
  const rerenderWith = (nextOver: Partial<React.ComponentProps<typeof HomeHeader>>) =>
    view.rerender(<HomeHeader {...baseProps} {...nextOver} />)
  return { onWeekChange, onRangeChange, rerenderWith }
}

describe('HomeHeader week range', () => {
  // /week is the one grid. Its masthead names the days on screen and steps by
  // that many; a preset or a custom start/end changes the VIEW, never a bucket.
  it('names a full week and steps by seven', () => {
    const { onWeekChange } = renderWeek()
    expect(screen.getAllByText('Sep 6 – 12').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByLabelText('Next week'))
    expect(ymd(onWeekChange.mock.calls[0][0])).toBe('2026-9-13')
  })

  it('names a two-day range and steps by two', () => {
    const { onWeekChange } = renderWeek({ weekStart: new Date(2026, 8, 12), rangeDays: 2 })
    expect(screen.getAllByText('Sep 12 – 13').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByLabelText('Later'))
    expect(ymd(onWeekChange.mock.calls[0][0])).toBe('2026-9-14')
  })

  it('names a single day without a dash', () => {
    renderWeek({ weekStart: new Date(2026, 8, 12), rangeDays: 1 })
    expect(screen.getAllByText('Sat, Sep 12').length).toBeGreaterThan(0)
  })

  it('offers the presets from the eyebrow menu and hands back a whole range', () => {
    const { onRangeChange } = renderWeek()
    // Nothing stands under the dates until you ask for it.
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
    pick('Weekend')
    const range = onRangeChange.mock.calls[0][0] as Date[]
    // Sat–Sun (a Sunday's answer is the COMING weekend — presetRange's rule).
    expect(range.length).toBe(2)
    expect(range.map((d) => d.getDay())).toEqual([6, 0])
    // Picking closes the menu.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    pick('3 days')
    expect((onRangeChange.mock.calls[1][0] as Date[]).length).toBe(3)
  })

  // Today is its own destination in the main navigation, not a one-day
  // "range" of the week (Scott, 2026-09-19).
  it('does not offer Today as a range', () => {
    renderWeek()
    fireEvent.click(rangeButton())
    expect(screen.queryByRole('menuitem', { name: 'Today' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['This week', 'Weekend', '3 days', 'Custom range…'])
  })

  it('the menu closes on Escape and hands focus back to its button', () => {
    renderWeek()
    const button = rangeButton()
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menuitem', { name: 'This week' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Weekend' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('the navigation\'s "Custom range…" opens the start/end inputs', () => {
    renderWeek({ customRangeRequest: 'nav-1' })
    expect(screen.getByLabelText('Start')).toBeInTheDocument()
    expect(screen.getByLabelText('End')).toBeInTheDocument()
  })

  it('"This week" is the calendar week, not seven days from today', () => {
    const { onRangeChange } = renderWeek({ weekStart: new Date(2026, 8, 12), rangeDays: 2 })
    pick('This week')
    const range = onRangeChange.mock.calls[0][0] as Date[]
    expect(range.length).toBe(7)
    // Anchored to the configured week start (Sunday by default).
    expect(range[0].getDay()).toBe(0)
  })

  it('a custom end resizes the range from the same start', () => {
    const { onRangeChange } = renderWeek()
    pick('Custom range…')
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '2026-09-10' } })
    const last = onRangeChange.mock.calls.at(-1)![0] as Date[]
    expect(last.map(ymd)).toEqual(['2026-9-6', '2026-9-7', '2026-9-8', '2026-9-9', '2026-9-10'])
  })

  it('a custom start slides the range along, keeping its length', () => {
    const { onRangeChange } = renderWeek({ weekStart: new Date(2026, 8, 12), rangeDays: 2 })
    pick('Custom range…')
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-09-19' } })
    const last = onRangeChange.mock.calls.at(-1)![0] as Date[]
    expect(last.map(ymd)).toEqual(['2026-9-19', '2026-9-20'])
  })
})

describe('HomeHeader week masthead card', () => {
  // Calm pass 2 (approved mockup 2026-10-18): the title row is
  // "‹ Oct 17 – 23 ›" — the arrows beside the dates, no WEEK eyebrow.
  it('is the same card Today wears: the arrows either side of the dates, no eyebrow', () => {
    renderWeek()
    const card = screen.getByTestId('masthead-card')
    expect(within(card).getByRole('heading', { level: 1, name: 'Sep 6 – 12' })).toBeInTheDocument()
    expect(screen.queryByTestId('masthead-eyebrow')).toBeNull()
    const row = within(titleRow())
    const order = [row.getByRole('button', { name: 'Previous week' }), row.getByRole('heading', { level: 1 }), row.getByRole('button', { name: 'Next week' })]
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText('Week')).toBeNull()
  })
  it('names a shorter range by its length', () => {
    renderWeek({ weekStart: new Date(2026, 8, 14), rangeDays: 2 })
    expect(within(titleRow()).getByText('2 days')).toBeInTheDocument()
  })

  // The ? and ▷ live in the Week page's ⋯ menu (WeekV2); the other
  // mastheads keep them beside the title.
  it('on v2 the week masthead draws no ? or ▷; the month masthead keeps its ?', () => {
    const help = vi.fn()
    render(<PageHelpContext.Provider value={help}><ReferenceListsProvider userId="test"><HomeHeader currentView="week" onViewChange={() => {}} viewedDate={new Date(2026, 8, 9)} onDateChange={() => {}}
      weekStart={new Date(2026, 8, 6)} onWeekChange={() => {}} monthStart={new Date(2026, 8, 1)} onMonthChange={() => {}} /></ReferenceListsProvider></PageHelpContext.Provider>)
    expect(screen.queryByRole('button', { name: EXPLAIN_LABEL })).toBeNull()
    cleanup()
    render(<PageHelpContext.Provider value={help}><HomeHeader currentView="month" onViewChange={() => {}} viewedDate={new Date(2026, 8, 9)} onDateChange={() => {}}
      weekStart={new Date(2026, 8, 6)} onWeekChange={() => {}} monthStart={new Date(2026, 8, 1)} onMonthChange={() => {}} /></PageHelpContext.Provider>)
    expect(screen.getByRole('button', { name: EXPLAIN_LABEL })).toBeInTheDocument()
  })

  // The eyebrow names what is on screen: a Sat–Sun run is a weekend however
  // it was reached (the preset, the navigation's Week menu, or a custom pick).
  it('a Sat–Sun range reads "Weekend", not a day count', () => {
    const { onRangeChange, rerenderWith } = renderWeek()
    pick('Weekend')
    const range = onRangeChange.mock.calls[0][0] as Date[]
    // The parent stores the picked range and re-renders with it.
    rerenderWith({ weekStart: range[0], rangeDays: range.length })
    expect(within(titleRow()).getByText('Weekend')).toBeInTheDocument()
  })

  it('a custom 2-day range still says "2 days", even right after a Weekend click', () => {
    const { rerenderWith } = renderWeek()
    pick('Weekend')
    pick('Custom range…')
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '2026-09-07' } })
    // Custom's End edit computed a 2-day range from the ORIGINAL weekStart
    // (Sep 6) — feed that back in, as the real parent would.
    rerenderWith({ weekStart: new Date(2026, 8, 6), rangeDays: 2 })
    expect(within(titleRow()).getByText('2 days')).toBeInTheDocument()
  })

  it('the Weekend label does not survive stepping to the next range with the chevron', () => {
    const { onRangeChange, onWeekChange, rerenderWith } = renderWeek()
    pick('Weekend')
    const range = onRangeChange.mock.calls[0][0] as Date[]
    rerenderWith({ weekStart: range[0], rangeDays: range.length })
    expect(within(titleRow()).getByText('Weekend')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Later'))
    const stepped = onWeekChange.mock.calls[0][0] as Date
    rerenderWith({ weekStart: stepped, rangeDays: range.length })
    expect(within(titleRow()).queryByText('Weekend')).not.toBeInTheDocument()
    expect(within(titleRow()).getByText('2 days')).toBeInTheDocument()
  })
})

describe('HomeHeader — the week has one view', () => {
  it('draws no Days | Hours switch, on v2 or the old planning pages', () => {
    renderWeek()
    expect(screen.queryByRole('radio', { name: 'Hours' })).toBeNull()
    localStorage.setItem('symphony-plan-v2', 'off')
    renderWeek()
    expect(screen.queryByRole('radio', { name: 'Hours' })).toBeNull()
    localStorage.removeItem('symphony-plan-v2')
  })
})


it('old planning pages (?plan=v1): the week Shelves launcher sits inside the date header', () => {
  localStorage.setItem('symphony-plan-v2', 'off')
  renderWeek()
  expect(screen.getByTestId('masthead-card')).toContainElement(screen.getByRole('button', { name: /Shelves/i }))
  localStorage.removeItem('symphony-plan-v2')
})

it('new planning pages (the default): no Shelves on the week — they live in the month column', () => {
  localStorage.removeItem('symphony-plan-v2')
  renderWeek()
  expect(screen.queryByRole('button', { name: /Shelves/i })).not.toBeInTheDocument()
})
