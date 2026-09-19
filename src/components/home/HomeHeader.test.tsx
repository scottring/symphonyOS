import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { HomeHeader } from './HomeHeader'

vi.mock('./HomeChromeControls', () => ({ HomeChromeControls: () => null }))

const ymd = (x: Date) => `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`

// The shorter runs live in a menu hung off the eyebrow label, not in a row of
// buttons under the dates.
function pick(name: string) {
  fireEvent.click(screen.getByRole('button', { name: /^(Week|Weekend|Day|\d+ days)$/ }))
  fireEvent.click(screen.getByRole('menuitem', { name }))
}

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
  const view = render(<HomeHeader {...baseProps} />)
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
    expect(screen.getAllByText('Sep 6 – Sep 12').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByLabelText('Next week'))
    expect(ymd(onWeekChange.mock.calls[0][0])).toBe('2026-9-13')
  })

  it('names a two-day range and steps by two', () => {
    const { onWeekChange } = renderWeek({ weekStart: new Date(2026, 8, 12), rangeDays: 2 })
    expect(screen.getAllByText('Sep 12 – Sep 13').length).toBeGreaterThan(0)
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
    fireEvent.click(screen.getByRole('button', { name: 'Week' }))
    expect(screen.queryByRole('menuitem', { name: 'Today' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['This week', 'Weekend', '3 days', 'Custom range…'])
  })

  it('the menu closes on Escape and hands focus back to its button', () => {
    renderWeek()
    const button = screen.getByRole('button', { name: 'Week' })
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
  it('is the same card Today wears, with the week named in the eyebrow and the range as the title', () => {
    renderWeek()
    const card = screen.getByTestId('masthead-card')
    expect(within(card).getByRole('heading', { level: 1, name: 'Sep 6 – Sep 12' })).toBeInTheDocument()
    expect(within(screen.getByTestId('masthead-eyebrow')).getByText('Week')).toBeInTheDocument()
  })
  it('names a shorter range by its length', () => {
    renderWeek({ weekStart: new Date(2026, 8, 14), rangeDays: 2 })
    expect(within(screen.getByTestId('masthead-eyebrow')).getByText('2 days')).toBeInTheDocument()
  })

  // The eyebrow names what is on screen: a Sat–Sun run is a weekend however
  // it was reached (the preset, the navigation's Week menu, or a custom pick).
  it('a Sat–Sun range reads "Weekend", not a day count', () => {
    const { onRangeChange, rerenderWith } = renderWeek()
    pick('Weekend')
    const range = onRangeChange.mock.calls[0][0] as Date[]
    // The parent stores the picked range and re-renders with it.
    rerenderWith({ weekStart: range[0], rangeDays: range.length })
    expect(within(screen.getByTestId('masthead-eyebrow')).getByText('Weekend')).toBeInTheDocument()
  })

  it('a custom 2-day range still says "2 days", even right after a Weekend click', () => {
    const { rerenderWith } = renderWeek()
    pick('Weekend')
    pick('Custom range…')
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '2026-09-07' } })
    // Custom's End edit computed a 2-day range from the ORIGINAL weekStart
    // (Sep 6) — feed that back in, as the real parent would.
    rerenderWith({ weekStart: new Date(2026, 8, 6), rangeDays: 2 })
    expect(within(screen.getByTestId('masthead-eyebrow')).getByText('2 days')).toBeInTheDocument()
  })

  it('the Weekend label does not survive stepping to the next range with the chevron', () => {
    const { onRangeChange, onWeekChange, rerenderWith } = renderWeek()
    pick('Weekend')
    const range = onRangeChange.mock.calls[0][0] as Date[]
    rerenderWith({ weekStart: range[0], rangeDays: range.length })
    expect(within(screen.getByTestId('masthead-eyebrow')).getByText('Weekend')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Later'))
    const stepped = onWeekChange.mock.calls[0][0] as Date
    rerenderWith({ weekStart: stepped, rangeDays: range.length })
    expect(within(screen.getByTestId('masthead-eyebrow')).queryByText('Weekend')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('masthead-eyebrow')).getByText('2 days')).toBeInTheDocument()
  })
})
