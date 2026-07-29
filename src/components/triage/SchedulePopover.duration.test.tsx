import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { SchedulePopover } from './SchedulePopover'

function openToTimeStep() {
  fireEvent.click(screen.getByText('Schedule'))
  fireEvent.click(screen.getByText('Tomorrow'))
}

describe('SchedulePopover duration row', () => {
  it('is hidden by default', () => {
    render(<SchedulePopover onSchedule={vi.fn()} trigger={<span>Schedule</span>} />)
    openToTimeStep()
    expect(screen.queryByRole('group', { name: /duration/i })).not.toBeInTheDocument()
  })

  it('passes the selected duration as the third argument', () => {
    const onSchedule = vi.fn()
    render(<SchedulePopover showDuration onSchedule={onSchedule} trigger={<span>Schedule</span>} />)
    openToTimeStep()

    fireEvent.click(screen.getByRole('button', { name: '30m' }))
    fireEvent.click(screen.getByText('2pm'))

    expect(onSchedule).toHaveBeenCalledWith(expect.any(Date), false, 30)
  })

  it('defaults to 60 minutes when the row is shown but untouched', () => {
    const onSchedule = vi.fn()
    render(<SchedulePopover showDuration onSchedule={onSchedule} trigger={<span>Schedule</span>} />)
    openToTimeStep()

    fireEvent.click(screen.getByText('2pm'))

    expect(onSchedule).toHaveBeenCalledWith(expect.any(Date), false, 60)
  })

  it('is back to the 1h default when a controlled caller reopens it after closing without picking', () => {
    const onSchedule = vi.fn()

    // Mirrors FocusInboxCard: the caller owns `open` and can close the popover
    // itself (its Escape handler does), which never runs handleClose.
    function ControlledHarness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(false)}>close from outside</button>
          <SchedulePopover
            showDuration
            open={open}
            onOpenChange={setOpen}
            onSchedule={onSchedule}
            trigger={<span>Schedule</span>}
          />
        </>
      )
    }
    render(<ControlledHarness />)

    openToTimeStep()
    fireEvent.click(screen.getByRole('button', { name: '30m' }))
    fireEvent.click(screen.getByRole('button', { name: /close from outside/i }))

    openToTimeStep()
    // The chip row shows the default again...
    expect(screen.getByRole('button', { name: '1h' }).className).toContain('bg-primary-100')
    expect(screen.getByRole('button', { name: '30m' }).className).not.toContain('bg-primary-100')
    // ...and so does what it reports.
    fireEvent.click(screen.getByText('2pm'))
    expect(onSchedule).toHaveBeenCalledWith(expect.any(Date), false, 60)
  })
})
