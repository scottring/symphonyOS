import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { TodayHeader } from './TodayHeader'

const d = new Date('2026-05-19T09:00:00')

describe('TodayHeader', () => {
  it('renders the formatted date and prev/next controls', () => {
    render(<TodayHeader viewedDate={d} onDateChange={vi.fn()} />)
    expect(screen.getByText(/Tuesday, May 19, 2026/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /previous day/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next day/i })).toBeInTheDocument()
  })
  it('prev/next shift the date by one day', async () => {
    const onDateChange = vi.fn()
    const { user } = render(<TodayHeader viewedDate={d} onDateChange={onDateChange} />)
    await user.click(screen.getByRole('button', { name: /next day/i }))
    const arg = onDateChange.mock.calls[0][0] as Date
    expect(arg.getDate()).toBe(20)
  })
})
