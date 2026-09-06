import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HomeHeader } from './HomeHeader'

vi.mock('./HomeChromeControls', () => ({ HomeChromeControls: () => null }))

const ymd = (x: Date) => `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`

function renderWeek(over: Partial<React.ComponentProps<typeof HomeHeader>> = {}) {
  const onWeekChange = vi.fn()
  const onRangeChange = vi.fn()
  render(
    <HomeHeader
      currentView="week"
      onViewChange={() => {}}
      viewedDate={new Date(2026, 8, 9)}
      onDateChange={() => {}}
      weekStart={new Date(2026, 8, 6)}
      onWeekChange={onWeekChange}
      rangeDays={7}
      onRangeChange={onRangeChange}
      monthStart={new Date(2026, 8, 1)}
      onMonthChange={() => {}}
      {...over}
    />,
  )
  return { onWeekChange, onRangeChange }
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

  it('offers the presets and hands back a whole range', () => {
    const { onRangeChange } = renderWeek()
    fireEvent.click(screen.getByRole('button', { name: 'Weekend' }))
    const range = onRangeChange.mock.calls[0][0] as Date[]
    // Sat–Sun, or Sunday alone when today IS Sunday (presetRange's rule) —
    // the suite must not go red on a calendar date.
    expect(range.length).toBeGreaterThanOrEqual(1)
    expect(range.length).toBeLessThanOrEqual(2)
    expect(range.every((d) => d.getDay() === 6 || d.getDay() === 0)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect((onRangeChange.mock.calls[1][0] as Date[]).length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: '3 days' }))
    expect((onRangeChange.mock.calls[2][0] as Date[]).length).toBe(3)
  })

  it('"This week" is the calendar week, not seven days from today', () => {
    const { onRangeChange } = renderWeek({ weekStart: new Date(2026, 8, 12), rangeDays: 2 })
    fireEvent.click(screen.getByRole('button', { name: 'This week' }))
    const range = onRangeChange.mock.calls[0][0] as Date[]
    expect(range.length).toBe(7)
    // Anchored to the configured week start (Sunday by default).
    expect(range[0].getDay()).toBe(0)
  })

  it('a custom end resizes the range from the same start', () => {
    const { onRangeChange } = renderWeek()
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '2026-09-10' } })
    const last = onRangeChange.mock.calls.at(-1)![0] as Date[]
    expect(last.map(ymd)).toEqual(['2026-9-6', '2026-9-7', '2026-9-8', '2026-9-9', '2026-9-10'])
  })

  it('a custom start slides the range along, keeping its length', () => {
    const { onRangeChange } = renderWeek({ weekStart: new Date(2026, 8, 12), rangeDays: 2 })
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-09-19' } })
    const last = onRangeChange.mock.calls.at(-1)![0] as Date[]
    expect(last.map(ymd)).toEqual(['2026-9-19', '2026-9-20'])
  })
})
