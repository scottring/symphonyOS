import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { MiniMonthPicker } from './MiniMonthPicker'

const selected = new Date(2026, 5, 4) // June 4, 2026
const today = new Date(2026, 5, 10) // June 10, 2026

describe('MiniMonthPicker', () => {
  it('renders the selected month and its day cells', () => {
    render(<MiniMonthPicker selected={selected} today={today} onSelect={vi.fn()} />)
    expect(screen.getByText('June 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'June 15, 2026' })).toBeInTheDocument()
  })

  it('calls onSelect with the clicked day', async () => {
    const onSelect = vi.fn()
    const { user } = render(<MiniMonthPicker selected={selected} today={today} onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: 'June 15, 2026' }))
    const arg = onSelect.mock.calls[0][0] as Date
    expect(arg.getFullYear()).toBe(2026)
    expect(arg.getMonth()).toBe(5)
    expect(arg.getDate()).toBe(15)
  })

  it('marks today with aria-current', () => {
    render(<MiniMonthPicker selected={selected} today={today} onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'June 10, 2026' })).toHaveAttribute('aria-current', 'date')
  })

  it('marks the selected day with aria-pressed', () => {
    render(<MiniMonthPicker selected={selected} today={today} onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'June 4, 2026' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('steps to the previous and next month', async () => {
    const { user } = render(<MiniMonthPicker selected={selected} today={today} onSelect={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /previous month/i }))
    expect(screen.getByText('May 2026')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /next month/i }))
    await user.click(screen.getByRole('button', { name: /next month/i }))
    expect(screen.getByText('July 2026')).toBeInTheDocument()
  })

  it('Today footer selects today', async () => {
    const onSelect = vi.fn()
    const { user } = render(<MiniMonthPicker selected={selected} today={today} onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: /^today$/i }))
    const arg = onSelect.mock.calls[0][0] as Date
    expect(arg.getDate()).toBe(10)
    expect(arg.getMonth()).toBe(5)
  })
})
