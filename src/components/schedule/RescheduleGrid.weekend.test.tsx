// Scott, on the walkthrough: "This weekend" and "Next weekend" silently chose
// Saturday. An event has to land on a specific day, so the picker must offer
// both — and a task, which can genuinely take either, must keep saying so.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { RescheduleGrid, weekendDaysFor, loadKeyForDay } from './RescheduleGrid'
import type { DayLoad } from '@/lib/today/dayLoad'

// A Wednesday, so "this weekend" is Sat 10 / Sun 11 Oct 2026 and "next" is
// Sat 17 / Sun 18.
const WEDNESDAY = new Date(2026, 9, 7, 9, 0)

const weekendWhens = ['this-weekend', 'next-weekend'] as const

const show = (props: Partial<Parameters<typeof RescheduleGrid>[0]> = {}) =>
  render(<RescheduleGrid onPick={vi.fn()} whens={weekendWhens} {...props} />)

const tiles = () => screen.getAllByRole('menuitem').map((b) => b.textContent ?? '')

describe('both weekend days', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(WEDNESDAY) })
  afterEach(() => { vi.useRealTimers() })

  it('resolves a weekend to its two days, through the app’s one definition', () => {
    const [sat, sun] = weekendDaysFor('this-weekend')!
    expect(sat).toEqual(new Date(2026, 9, 10))
    expect(sun).toEqual(new Date(2026, 9, 11))
    const [nextSat, nextSun] = weekendDaysFor('next-weekend')!
    expect(nextSat).toEqual(new Date(2026, 9, 17))
    expect(nextSun).toEqual(new Date(2026, 9, 18))
    expect(weekendDaysFor('tomorrow')).toBeNull()
  })

  it('offers Saturday AND Sunday, each with its date', () => {
    show({ weekendDays: true })
    const text = tiles().join(' | ')
    expect(text).toMatch(/Sat, Oct 10/)
    expect(text).toMatch(/Sun, Oct 11/)
    expect(text).toMatch(/Sat, Oct 17/)
    expect(text).toMatch(/Sun, Oct 18/)
    expect(screen.getAllByRole('menuitem')).toHaveLength(4)
  })

  it('tells the caller which day was chosen — never assuming Saturday', () => {
    const onPick = vi.fn()
    show({ weekendDays: true, onPick })
    fireEvent.click(screen.getAllByRole('menuitem').find((b) => /Sun, Oct 11/.test(b.textContent ?? ''))!)
    expect(onPick).toHaveBeenCalledWith('this-weekend', new Date(2026, 9, 11))
  })

  it('reads each day’s own booked time, not Saturday’s for both', () => {
    const loads = new Map<string, DayLoad>([
      [loadKeyForDay(new Date(2026, 9, 10)), { date: new Date(2026, 9, 10), minutes: 300, percent: 60, level: 'busy' } as unknown as DayLoad],
      [loadKeyForDay(new Date(2026, 9, 11)), { date: new Date(2026, 9, 11), minutes: 0, percent: 0, level: 'open' } as unknown as DayLoad],
    ])
    show({ weekendDays: true, loads })
    // Both days carry a bar of their own — the shared DayLoadBar, which is
    // BOOKED TIME and stays distinct from the day tiles' density counts.
    const sat = screen.getAllByRole('menuitem').find((b) => /Sat, Oct 10/.test(b.textContent ?? ''))!
    const sun = screen.getAllByRole('menuitem').find((b) => /Sun, Oct 11/.test(b.textContent ?? ''))!
    expect(within(sat.closest('[data-tile]') as HTMLElement).queryByText(/%|hour|min/i) ?? sat.closest('[data-tile]')).toBeTruthy()
    expect(sun.closest('[data-tile]')).toBeTruthy()
  })

  it('leaves a task’s "either day" exactly as it was', () => {
    const onPick = vi.fn()
    show({ flexibleWeekend: true, onPick })
    const text = tiles().join(' | ')
    expect(text).toMatch(/either day/)
    // Its own line, not appended to the dates — together they ran past the
    // tile's edge in the side panel.
    expect(screen.getAllByText('either day')).toHaveLength(2)
    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('menuitem')[0])
    // The old call shape, unchanged: no day, because the task does not need one.
    expect(onPick).toHaveBeenCalledWith('this-weekend')
  })

  it('and a caller that asks for neither keeps one tile per weekend', () => {
    show({})
    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
  })
})

describe('across a month and a year boundary', () => {
  afterEach(() => { vi.useRealTimers() })

  it('a weekend that straddles the end of a month', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 28, 9, 0))        // Wed 28 Oct 2026
    const [sat, sun] = weekendDaysFor('this-weekend')!
    expect(sat).toEqual(new Date(2026, 9, 31))
    expect(sun).toEqual(new Date(2026, 10, 1))           // 1 Nov
    render(<RescheduleGrid onPick={vi.fn()} whens={['this-weekend']} weekendDays />)
    expect(tiles().join(' | ')).toMatch(/Sun, Nov 1/)
  })

  it('a weekend that straddles the end of a year', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2027, 11, 29, 9, 0))       // Wed 29 Dec 2027
    const [sat, sun] = weekendDaysFor('this-weekend')!
    expect(sat).toEqual(new Date(2028, 0, 1))            // Sat 1 Jan 2028
    expect(sun).toEqual(new Date(2028, 0, 2))
    render(<RescheduleGrid onPick={vi.fn()} whens={['this-weekend']} weekendDays />)
    const text = tiles().join(' | ')
    expect(text).toMatch(/Sat, Jan 1/)
    expect(text).toMatch(/Sun, Jan 2/)
  })

  it('opened ON a Sunday, the weekend in progress is still this one', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0))        // Sun 11 Oct 2026
    const [sat, sun] = weekendDaysFor('this-weekend')!
    expect(sat).toEqual(new Date(2026, 9, 10))
    expect(sun).toEqual(new Date(2026, 9, 11))
  })
})
