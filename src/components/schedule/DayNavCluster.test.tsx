import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { DayNavCluster } from './DayNavCluster'

const tue = new Date(2026, 4, 19) // Tuesday, May 19, 2026
const wed = new Date(2026, 4, 20) // Wednesday, May 20, 2026

describe('DayNavCluster', () => {
  it('renders the weekday eyebrow and the date headline', () => {
    render(<DayNavCluster viewedDate={tue} today={tue} onDateChange={vi.fn()} />)
    expect(screen.getByText('Tuesday')).toBeInTheDocument()
    expect(screen.getByText('May 19, 2026')).toBeInTheDocument()
  })

  it('prev/next shift the date by one day', async () => {
    const onDateChange = vi.fn()
    const { user } = render(<DayNavCluster viewedDate={tue} today={tue} onDateChange={onDateChange} />)
    await user.click(screen.getByRole('button', { name: /next day/i }))
    expect((onDateChange.mock.calls[0][0] as Date).getDate()).toBe(20)
    await user.click(screen.getByRole('button', { name: /previous day/i }))
    expect((onDateChange.mock.calls[1][0] as Date).getDate()).toBe(18)
  })

  it('opens the month picker on date click and selecting a day changes + closes it', async () => {
    const onDateChange = vi.fn()
    const { user } = render(<DayNavCluster viewedDate={tue} today={tue} onDateChange={onDateChange} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /May 19, 2026/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'May 25, 2026' }))
    expect((onDateChange.mock.calls[0][0] as Date).getDate()).toBe(25)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('hides the Today chip when already viewing today', () => {
    render(<DayNavCluster viewedDate={tue} today={tue} onDateChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /go to today/i })).not.toBeInTheDocument()
  })

  it('shows the Today chip on another day and jumps home when clicked', async () => {
    const onDateChange = vi.fn()
    const { user } = render(<DayNavCluster viewedDate={wed} today={tue} onDateChange={onDateChange} />)
    await user.click(screen.getByRole('button', { name: /go to today/i }))
    const arg = onDateChange.mock.calls[0][0] as Date
    expect(arg.getDate()).toBe(19)
    expect(arg.getMonth()).toBe(4)
  })
})
