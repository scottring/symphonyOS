import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeekRangePopover } from './WeekRangePopover'

const weekStart = new Date(2026, 6, 12) // Sunday July 12, 2026

describe('WeekRangePopover', () => {
  it('emits an ISO start date and null end for a Tue start', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<WeekRangePopover weekStart={weekStart} activeRange={{ firstDay: 0, lastDay: 6 }} onChange={onChange} />)
    await user.click(screen.getByLabelText('Edit week days'))
    await user.selectOptions(screen.getByLabelText(/First day/), '2')
    expect(onChange).toHaveBeenCalledWith('2026-07-14', null)
  })

  it('emits an ISO end date and null start for an early end', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<WeekRangePopover weekStart={weekStart} activeRange={{ firstDay: 0, lastDay: 6 }} onChange={onChange} />)
    await user.click(screen.getByLabelText('Edit week days'))
    await user.selectOptions(screen.getByLabelText(/Last day/), '4')
    expect(onChange).toHaveBeenCalledWith(null, '2026-07-16')
  })

  it('emits nulls on reset to full week', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<WeekRangePopover weekStart={weekStart} activeRange={{ firstDay: 2, lastDay: 5 }} onChange={onChange} />)
    await user.click(screen.getByLabelText('Edit week days'))
    await user.click(screen.getByText('Reset to full week'))
    expect(onChange).toHaveBeenCalledWith(null, null)
  })

  it('clamps the last day up when the first day passes it', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<WeekRangePopover weekStart={weekStart} activeRange={{ firstDay: 0, lastDay: 2 }} onChange={onChange} />)
    await user.click(screen.getByLabelText('Edit week days'))
    await user.selectOptions(screen.getByLabelText(/First day/), '4')
    expect(onChange).toHaveBeenCalledWith('2026-07-16', '2026-07-16')
  })
})
