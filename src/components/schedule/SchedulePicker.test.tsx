import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SchedulePicker } from './SchedulePicker'
import { loadKeyFor } from './RescheduleGrid'
import type { DayLoad } from '@/lib/today/dayLoad'

const today = new Date()
today.setHours(0, 0, 0, 0)

const load = (over: Partial<DayLoad> = {}): DayLoad => ({
  date: today,
  bookedMinutes: 0,
  windowMinutes: 780,
  timedCount: 0,
  allDayCount: 0,
  items: [],
  openSlots: [],
  eventsAvailable: true,
  ...over,
})

const todayLoads = (over: Partial<DayLoad> = {}) =>
  new Map([[loadKeyFor('today'), load(over)]])


/**
 * Scope a query to the "Today" tile.
 *
 * `loadKeyFor` keys by calendar DAY, so more than one tile can legitimately
 * resolve to the same day and render the same load — run this on a Saturday and
 * `today` and `this-weekend` are both today, so a bare screen.getByLabelText
 * for the fullness bar matched two elements and every one of these tests failed.
 * The load fixture is Today's; assert against Today's tile.
 */
function todayTile(): HTMLElement {
  return screen.getAllByText('Today')[0].closest('[data-tile]') as HTMLElement
}

async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^schedule$/i }))
}

describe('SchedulePicker', () => {
  it('opens the grid from the trigger', async () => {
    const user = userEvent.setup()
    render(<SchedulePicker onSchedule={vi.fn()} loads={new Map()} />)
    await openPicker(user)
    expect(screen.getByText('Tomorrow')).toBeInTheDocument()
  })

  it('shows a fullness bar and all-day count for a dated tile', async () => {
    const user = userEvent.setup()
    render(
      <SchedulePicker
        onSchedule={vi.fn()}
        loads={todayLoads({ bookedMinutes: 390, allDayCount: 5 })}
      />,
    )
    await openPicker(user)

    const bar = within(todayTile()).getByLabelText(/50% booked/i)
    expect(bar).toBeInTheDocument()
    expect(within(bar.closest('[data-tile]')!).getByText('+5')).toBeInTheDocument()
  })

  it('shows no bar for a pool tile', async () => {
    const user = userEvent.setup()
    render(<SchedulePicker onSchedule={vi.fn()} loads={todayLoads()} />)
    await openPicker(user)

    const someday = screen.getByText('Someday').closest('[data-tile]')!
    expect(within(someday).queryByRole('progressbar')).toBeNull()
  })

  it('the tile label still schedules directly', async () => {
    const user = userEvent.setup()
    const onReschedule = vi.fn()
    render(
      <SchedulePicker onSchedule={vi.fn()} onReschedule={onReschedule} loads={new Map()} />,
    )
    await openPicker(user)
    await user.click(screen.getByText('Tomorrow'))
    expect(onReschedule).toHaveBeenCalledWith('tomorrow')
  })

  it('the bar opens the day peek instead of scheduling', async () => {
    const user = userEvent.setup()
    const onReschedule = vi.fn()
    render(
      <SchedulePicker
        onSchedule={vi.fn()}
        onReschedule={onReschedule}
        loads={todayLoads({ bookedMinutes: 120 })}
      />,
    )
    await openPicker(user)
    await user.click(within(todayTile()).getByLabelText(/15% booked/i))

    expect(onReschedule).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /back to schedule for/i })).toBeInTheDocument()
  })

  it('goes back to the grid from the peek', async () => {
    const user = userEvent.setup()
    render(<SchedulePicker onSchedule={vi.fn()} loads={todayLoads({ bookedMinutes: 120 })} />)
    await openPicker(user)
    await user.click(within(todayTile()).getByLabelText(/15% booked/i))
    await user.click(screen.getByRole('button', { name: /back to schedule for/i }))
    expect(screen.getByText('Tomorrow')).toBeInTheDocument()
  })

  it('schedules at an open slot from the peek', async () => {
    const user = userEvent.setup()
    const onSchedule = vi.fn()
    const slotStart = new Date(today)
    slotStart.setHours(10, 0, 0, 0)
    const slotEnd = new Date(today)
    slotEnd.setHours(14, 0, 0, 0)

    render(
      <SchedulePicker
        onSchedule={onSchedule}
        loads={todayLoads({ bookedMinutes: 60, openSlots: [{ start: slotStart, end: slotEnd }] })}
      />,
    )
    await openPicker(user)
    await user.click(within(todayTile()).getByLabelText(/8% booked/i))
    await user.click(screen.getByRole('button', { name: /open 10:00 AM/i }))

    expect(onSchedule).toHaveBeenCalledWith(slotStart, false)
  })

  it('schedules all day from the peek footer', async () => {
    const user = userEvent.setup()
    const onSchedule = vi.fn()
    render(
      <SchedulePicker onSchedule={onSchedule} loads={todayLoads({ bookedMinutes: 120 })} />,
    )
    await openPicker(user)
    await user.click(within(todayTile()).getByLabelText(/15% booked/i))
    await user.click(screen.getByRole('button', { name: /put it here · all day/i }))

    expect(onSchedule).toHaveBeenCalledWith(today, true)
  })

  it('says so when event data is unavailable rather than under-reporting', async () => {
    const user = userEvent.setup()
    render(<SchedulePicker onSchedule={vi.fn()} loads={todayLoads({ eventsAvailable: false })} />)
    await openPicker(user)
    expect(within(todayTile()).getByText(/events unavailable/i)).toBeInTheDocument()
  })

  it('offers Clear schedule only when the item is already scheduled', async () => {
    const user = userEvent.setup()
    const onClearSchedule = vi.fn()
    const { rerender } = render(
      <SchedulePicker onSchedule={vi.fn()} onClearSchedule={onClearSchedule} loads={new Map()} />,
    )
    await openPicker(user)
    expect(screen.queryByRole('button', { name: /clear schedule/i })).not.toBeInTheDocument()

    rerender(
      <SchedulePicker
        onSchedule={vi.fn()}
        onClearSchedule={onClearSchedule}
        scheduledFor={today}
        loads={new Map()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /clear schedule/i }))
    expect(onClearSchedule).toHaveBeenCalledOnce()
  })
})
