import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SchedulePopover } from './SchedulePopover'

describe('SchedulePopover horizon buckets (unified When picker)', () => {
  it('omits the horizon section when onDefer is not provided (dates only)', () => {
    render(<SchedulePopover onSchedule={vi.fn()} trigger={<button>open</button>} />)
    fireEvent.click(screen.getByText('open'))
    expect(screen.queryByText('Someday')).toBeNull()
    expect(screen.queryByText('This Week')).toBeNull()
  })

  it('renders the horizon buckets when onDefer is provided', () => {
    render(<SchedulePopover onSchedule={vi.fn()} onDefer={vi.fn()} trigger={<button>open</button>} />)
    fireEvent.click(screen.getByText('open'))
    expect(screen.getByText('This Week')).toBeInTheDocument()
    expect(screen.getByText('Next Month')).toBeInTheDocument()
    expect(screen.getByText('Someday')).toBeInTheDocument()
  })

  it('fires onDefer with the right bucket', () => {
    const onDefer = vi.fn()
    render(<SchedulePopover onSchedule={vi.fn()} onDefer={onDefer} trigger={<button>open</button>} />)
    fireEvent.click(screen.getByText('open'))
    fireEvent.click(screen.getByText('Someday'))
    expect(onDefer).toHaveBeenCalledWith('quarter')
  })
})
